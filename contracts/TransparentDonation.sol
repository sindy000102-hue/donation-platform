// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * @title TransparentDonation
 * @notice 투명 기부 플랫폼
 *  - NFT 기부 영수증 (ERC-721)
 *  - 마감 후 또는 목표 달성 시 인출
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
        uint256 deadline;
        bool isActive;
        bool withdrawn;
    }

    struct Donation {
        address donor;
        uint256 amount;
        uint256 timestamp;
        string message;
        uint256 nftTokenId;
    }

    uint256 public campaignCount;
    uint256 private _nextTokenId;

    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => Donation[]) public donations;
    mapping(uint256 => mapping(address => uint256)) public donorTotal;
    mapping(uint256 => string[]) public evidenceHashes;

    event CampaignCreated(uint256 indexed id, address indexed creator, string title, uint256 goalAmount);
    event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount, uint256 nftTokenId);
    event NFTMinted(uint256 indexed tokenId, address indexed donor, uint256 indexed campaignId, uint256 amount);
    event FundsWithdrawn(uint256 indexed campaignId, address indexed creator, uint256 amount);
    event CampaignCompleted(uint256 indexed campaignId);
    event CampaignDeactivated(uint256 indexed id, address indexed deactivatedBy);
    event DonationRefunded(uint256 indexed campaignId, address indexed donor, uint256 amount);
    event EvidenceSubmitted(uint256 indexed campaignId, string evidenceHash);

    error CampaignNotActive();
    error DeadlinePassed();
    error ZeroAmount();
    error NotCampaignCreator();
    error TransferFailed();
    error NotAuthorized();
    error AlreadyWithdrawn();
    error WithdrawNotAllowed();

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
            deadline: block.timestamp + (_durationDays * 1 days), isActive: true, withdrawn: false
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

        // 목표 달성 시 자동 조기 완료
        if (c.raisedAmount >= c.goalAmount) {
            emit CampaignCompleted(_campaignId);
        }
    }

    // ── 자금 인출 (마감 후 또는 목표 100% 달성 시) ──
    function withdraw(uint256 _campaignId) external nonReentrant {
        Campaign storage c = campaigns[_campaignId];
        if (msg.sender != c.creator) revert NotCampaignCreator();
        if (c.withdrawn) revert AlreadyWithdrawn();
        if (c.raisedAmount == 0) revert ZeroAmount();

        // 조건: 마감 후 OR 목표 달성
        bool deadlinePassed = block.timestamp > c.deadline;
        bool goalReached = c.raisedAmount >= c.goalAmount;
        if (!deadlinePassed && !goalReached) revert WithdrawNotAllowed();

        uint256 amount = c.raisedAmount;
        c.withdrawn = true;
        c.isActive = false;

        (bool success, ) = payable(c.creator).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit FundsWithdrawn(_campaignId, c.creator, amount);
    }

    // ── 증빙 제출 (IPFS 해시 온체인 기록) ──
    function submitEvidence(uint256 _campaignId, string calldata _evidenceHash) external {
        Campaign storage c = campaigns[_campaignId];
        if (msg.sender != c.creator) revert NotCampaignCreator();
        evidenceHashes[_campaignId].push(_evidenceHash);
        emit EvidenceSubmitted(_campaignId, _evidenceHash);
    }

    // ── 캠페인 삭제 + 환불 ──
    function deactivateCampaign(uint256 _campaignId) external nonReentrant {
        Campaign storage c = campaigns[_campaignId];
        if (!c.isActive) revert CampaignNotActive();
        if (msg.sender != owner() && msg.sender != c.creator) revert NotAuthorized();
        c.isActive = false;

        if (c.raisedAmount > 0 && !c.withdrawn) {
            Donation[] storage donList = donations[_campaignId];
            for (uint256 i = 0; i < donList.length; i++) {
                uint256 refundAmount = donList[i].amount;
                if (refundAmount > 0) {
                    (bool success, ) = payable(donList[i].donor).call{value: refundAmount}("");
                    if (success) emit DonationRefunded(_campaignId, donList[i].donor, refundAmount);
                }
            }
            c.raisedAmount = 0;
        }
        emit CampaignDeactivated(_campaignId, msg.sender);
    }

    // ── 조회 ──
    function getCampaign(uint256 _id) external view returns (Campaign memory) { return campaigns[_id]; }
    function getDonations(uint256 _campaignId) external view returns (Donation[] memory) { return donations[_campaignId]; }
    function getDonationCount(uint256 _campaignId) external view returns (uint256) { return donations[_campaignId].length; }
    function getEvidenceHashes(uint256 _campaignId) external view returns (string[] memory) { return evidenceHashes[_campaignId]; }

    // ── NFT 메타데이터 빌더 ──
    function _buildTokenURI(uint256 tokenId, string memory campaignTitle, uint256 amount, address donor) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '{"name":"Donation Receipt #', _toString(tokenId),
            '","description":"Transparent Donation - ', campaignTitle,
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