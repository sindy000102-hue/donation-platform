// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * @title TransparentDonation
 * @notice 투명 기부 플랫폼
 *  - NFT 기부 영수증 발급 (ERC-721)
 *  - 단계별 자금 방출 (25/50/75/100%)
 *  - IPFS 증빙 해시 온체인 기록
 */
contract TransparentDonation is Ownable, ReentrancyGuard, ERC721URIStorage {

    struct Campaign {
        uint256 id;
        address creator;
        string title;
        string description;
        string imageHash;
        uint256 goalAmount;
        uint256 raisedAmount;
        uint256 withdrawnAmount;
        uint256 deadline;
        bool isActive;
    }

    struct Donation {
        address donor;
        uint256 amount;
        uint256 timestamp;
        string message;
        uint256 nftTokenId;
    }

    struct Milestone {
        bool evidenceSubmitted;
        bool fundsClaimed;
        string evidenceHash;
        string evidenceNote;
        uint256 claimedAt;
    }

    uint256 public campaignCount;
    uint256 private _nextTokenId;
    uint8[4] public MILESTONE_PERCENTS = [25, 50, 75, 100];

    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => Donation[]) public donations;
    mapping(uint256 => mapping(address => uint256)) public donorTotal;
    mapping(uint256 => Milestone[4]) public milestones;
    mapping(uint256 => string[]) public evidenceHashes;

    event CampaignCreated(uint256 indexed id, address indexed creator, string title, uint256 goalAmount);
    event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount, uint256 nftTokenId);
    event NFTMinted(uint256 indexed tokenId, address indexed donor, uint256 indexed campaignId, uint256 amount);
    event MilestoneEvidenceSubmitted(uint256 indexed campaignId, uint8 milestoneIndex, string evidenceHash);
    event MilestoneFundsClaimed(uint256 indexed campaignId, uint8 milestoneIndex, uint256 amount);
    event CampaignDeactivated(uint256 indexed id, address indexed deactivatedBy);
    event DonationRefunded(uint256 indexed campaignId, address indexed donor, uint256 amount);

    error CampaignNotActive();
    error DeadlinePassed();
    error ZeroAmount();
    error NotCampaignCreator();
    error TransferFailed();
    error NotAuthorized();
    error MilestoneNotReached();
    error EvidenceNotSubmitted();
    error AlreadyClaimed();
    error InvalidMilestone();

    constructor() Ownable(msg.sender) ERC721("DonationReceipt", "DONATE") {}

    // ── 캠페인 생성 ──
    function createCampaign(
        string calldata _title, string calldata _description,
        string calldata _imageHash, uint256 _goalAmount, uint256 _durationDays
    ) external returns (uint256) {
        if (_goalAmount == 0) revert ZeroAmount();
        uint256 id = campaignCount++;
        campaigns[id] = Campaign({
            id: id, creator: msg.sender, title: _title, description: _description,
            imageHash: _imageHash, goalAmount: _goalAmount, raisedAmount: 0,
            withdrawnAmount: 0, deadline: block.timestamp + (_durationDays * 1 days), isActive: true
        });
        emit CampaignCreated(id, msg.sender, _title, _goalAmount);
        return id;
    }

    // ── 기부 + NFT 영수증 발급 ──
    function donate(uint256 _campaignId, string calldata _message) external payable nonReentrant {
        Campaign storage c = campaigns[_campaignId];
        if (!c.isActive) revert CampaignNotActive();
        if (block.timestamp > c.deadline) revert DeadlinePassed();
        if (msg.value == 0) revert ZeroAmount();

        c.raisedAmount += msg.value;
        donorTotal[_campaignId][msg.sender] += msg.value;

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, _buildTokenURI(tokenId, c.title, msg.value, msg.sender));

        donations[_campaignId].push(Donation({
            donor: msg.sender, amount: msg.value, timestamp: block.timestamp,
            message: _message, nftTokenId: tokenId
        }));

        emit DonationReceived(_campaignId, msg.sender, msg.value, tokenId);
        emit NFTMinted(tokenId, msg.sender, _campaignId, msg.value);
    }

    // ── 마일스톤 증빙 제출 ──
    function submitMilestoneEvidence(
        uint256 _campaignId, uint8 _milestoneIndex,
        string calldata _evidenceHash, string calldata _note
    ) external {
        if (_milestoneIndex > 3) revert InvalidMilestone();
        Campaign storage c = campaigns[_campaignId];
        if (msg.sender != c.creator) revert NotCampaignCreator();

        milestones[_campaignId][_milestoneIndex].evidenceSubmitted = true;
        milestones[_campaignId][_milestoneIndex].evidenceHash = _evidenceHash;
        milestones[_campaignId][_milestoneIndex].evidenceNote = _note;
        evidenceHashes[_campaignId].push(_evidenceHash);

        emit MilestoneEvidenceSubmitted(_campaignId, _milestoneIndex, _evidenceHash);
    }

    // ── 마일스톤별 자금 인출 ──
    function claimMilestone(uint256 _campaignId, uint8 _milestoneIndex) external nonReentrant {
        if (_milestoneIndex > 3) revert InvalidMilestone();
        Campaign storage c = campaigns[_campaignId];
        if (msg.sender != c.creator) revert NotCampaignCreator();

        Milestone storage m = milestones[_campaignId][_milestoneIndex];
        if (m.fundsClaimed) revert AlreadyClaimed();
        if (!m.evidenceSubmitted) revert EvidenceNotSubmitted();

        uint256 requiredAmount = (c.goalAmount * MILESTONE_PERCENTS[_milestoneIndex]) / 100;
        if (c.raisedAmount < requiredAmount) revert MilestoneNotReached();

        if (_milestoneIndex > 0 && !milestones[_campaignId][_milestoneIndex - 1].fundsClaimed)
            revert InvalidMilestone();

        uint256 milestoneAmount = c.goalAmount / 4;
        uint256 available = c.raisedAmount - c.withdrawnAmount;
        uint256 claimAmount = milestoneAmount > available ? available : milestoneAmount;
        if (claimAmount == 0) revert ZeroAmount();

        m.fundsClaimed = true;
        m.claimedAt = block.timestamp;
        c.withdrawnAmount += claimAmount;

        if (_milestoneIndex == 3) {
            uint256 remaining = c.raisedAmount - c.withdrawnAmount;
            if (remaining > 0) { c.withdrawnAmount += remaining; claimAmount += remaining; }
            c.isActive = false;
        }

        (bool success, ) = payable(c.creator).call{value: claimAmount}("");
        if (!success) revert TransferFailed();
        emit MilestoneFundsClaimed(_campaignId, _milestoneIndex, claimAmount);
    }

    // ── 캠페인 삭제 + 비율 환불 ──
    function deactivateCampaign(uint256 _campaignId) external nonReentrant {
        Campaign storage c = campaigns[_campaignId];
        if (!c.isActive) revert CampaignNotActive();
        if (msg.sender != owner() && msg.sender != c.creator) revert NotAuthorized();
        c.isActive = false;

        uint256 refundable = c.raisedAmount - c.withdrawnAmount;
        if (refundable > 0) {
            Donation[] storage donList = donations[_campaignId];
            uint256 totalDonated = 0;
            for (uint256 i = 0; i < donList.length; i++) totalDonated += donList[i].amount;
            for (uint256 i = 0; i < donList.length; i++) {
                uint256 refundAmount = (donList[i].amount * refundable) / totalDonated;
                if (refundAmount > 0) {
                    (bool success, ) = payable(donList[i].donor).call{value: refundAmount}("");
                    if (success) emit DonationRefunded(_campaignId, donList[i].donor, refundAmount);
                }
            }
            c.withdrawnAmount = c.raisedAmount;
        }
        emit CampaignDeactivated(_campaignId, msg.sender);
    }

    // ── 조회 ──
    function getCampaign(uint256 _id) external view returns (Campaign memory) { return campaigns[_id]; }
    function getDonations(uint256 _campaignId) external view returns (Donation[] memory) { return donations[_campaignId]; }
    function getDonationCount(uint256 _campaignId) external view returns (uint256) { return donations[_campaignId].length; }
    function getMilestones(uint256 _campaignId) external view returns (Milestone[4] memory) { return milestones[_campaignId]; }
    function getEvidenceHashes(uint256 _campaignId) external view returns (string[] memory) { return evidenceHashes[_campaignId]; }

    // ── NFT 메타데이터 빌더 ──
    function _buildTokenURI(uint256 tokenId, string memory campaignTitle, uint256 amount, address donor) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '{"name":"Donation Receipt #', _toString(tokenId),
            '","description":"Transparent Donation Platform - ', campaignTitle,
            '","attributes":[{"trait_type":"Amount (finney)","value":', _toString(amount / 1e15),
            '},{"trait_type":"Donor","value":"', _toHexString(donor), '"}]}'
        ));
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value; uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) { digits -= 1; buffer[digits] = bytes1(uint8(48 + value % 10)); value /= 10; }
        return string(buffer);
    }

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory s = new bytes(42); s[0] = "0"; s[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint160(addr) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16); bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2+i*2] = uint8(hi) < 10 ? bytes1(uint8(hi) + 0x30) : bytes1(uint8(hi) + 0x57);
            s[3+i*2] = uint8(lo) < 10 ? bytes1(uint8(lo) + 0x30) : bytes1(uint8(lo) + 0x57);
        }
        return string(s);
    }
}
