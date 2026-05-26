const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("TransparentDonation", function () {
  let donation, owner, donor1, donor2, other;

  beforeEach(async function () {
    [owner, donor1, donor2, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TransparentDonation");
    donation = await Factory.deploy();
    await donation.waitForDeployment();
  });

  // ═══════════════════════════════════
  // 캠페인 생성
  // ═══════════════════════════════════
  describe("캠페인 생성", function () {
    it("캠페인을 정상 생성한다", async function () {
      const tx = await donation.createCampaign(
        "테스트 캠페인", "설명입니다", "QmTestHash",
        ethers.parseEther("1"), 30
      );
      await tx.wait();

      const campaign = await donation.getCampaign(0);
      expect(campaign.title).to.equal("테스트 캠페인");
      expect(campaign.goalAmount).to.equal(ethers.parseEther("1"));
      expect(campaign.isActive).to.be.true;
      expect(campaign.creator).to.equal(owner.address);
    });

    it("목표금액 0이면 revert", async function () {
      await expect(
        donation.createCampaign("제목", "설명", "", 0, 30)
      ).to.be.revertedWithCustomError(donation, "ZeroAmount");
    });

    it("CampaignCreated 이벤트가 발생한다", async function () {
      await expect(
        donation.createCampaign("이벤트 테스트", "설명", "", ethers.parseEther("2"), 30)
      ).to.emit(donation, "CampaignCreated")
        .withArgs(0, owner.address, "이벤트 테스트", ethers.parseEther("2"));
    });

    it("캠페인 ID가 순차적으로 증가한다", async function () {
      await donation.createCampaign("첫번째", "", "", ethers.parseEther("1"), 30);
      await donation.createCampaign("두번째", "", "", ethers.parseEther("2"), 30);

      const c0 = await donation.getCampaign(0);
      const c1 = await donation.getCampaign(1);
      expect(c0.title).to.equal("첫번째");
      expect(c1.title).to.equal("두번째");
      expect(await donation.campaignCount()).to.equal(2);
    });
  });

  // ═══════════════════════════════════
  // 기부
  // ═══════════════════════════════════
  describe("기부", function () {
    beforeEach(async function () {
      await donation.createCampaign(
        "기부 캠페인", "설명", "", ethers.parseEther("1"), 30
      );
    });

    it("기부를 정상 처리한다", async function () {
      await donation.connect(donor1).donate(0, "응원합니다!", {
        value: ethers.parseEther("0.1"),
      });

      const campaign = await donation.getCampaign(0);
      expect(campaign.raisedAmount).to.equal(ethers.parseEther("0.1"));

      const donationList = await donation.getDonations(0);
      expect(donationList.length).to.equal(1);
      expect(donationList[0].message).to.equal("응원합니다!");
      expect(donationList[0].donor).to.equal(donor1.address);
    });

    it("0 ETH 기부는 revert", async function () {
      await expect(
        donation.connect(donor1).donate(0, "메시지", { value: 0 })
      ).to.be.revertedWithCustomError(donation, "ZeroAmount");
    });

    it("여러 기부자의 기부금이 누적된다", async function () {
      await donation.connect(donor1).donate(0, "첫 기부", {
        value: ethers.parseEther("0.3"),
      });
      await donation.connect(donor2).donate(0, "두번째 기부", {
        value: ethers.parseEther("0.5"),
      });

      const campaign = await donation.getCampaign(0);
      expect(campaign.raisedAmount).to.equal(ethers.parseEther("0.8"));
      expect(await donation.getDonationCount(0)).to.equal(2);
    });

    it("비활성 캠페인에 기부하면 revert", async function () {
      // 관리자가 캠페인 비활성화
      await donation.deactivateCampaign(0);

      await expect(
        donation.connect(donor1).donate(0, "기부", { value: ethers.parseEther("0.1") })
      ).to.be.revertedWithCustomError(donation, "CampaignNotActive");
    });

    it("마감된 캠페인에 기부하면 revert", async function () {
      // 30일 후로 시간 이동
      await time.increase(31 * 24 * 60 * 60);

      await expect(
        donation.connect(donor1).donate(0, "기부", { value: ethers.parseEther("0.1") })
      ).to.be.revertedWithCustomError(donation, "DeadlinePassed");
    });
  });

  // ═══════════════════════════════════
  // 자금 인출
  // ═══════════════════════════════════
  describe("자금 인출", function () {
    beforeEach(async function () {
      await donation.createCampaign(
        "인출 테스트", "설명", "", ethers.parseEther("1"), 30
      );
      await donation.connect(donor1).donate(0, "기부!", {
        value: ethers.parseEther("0.5"),
      });
    });

    it("마감 후 생성자가 정상 인출한다", async function () {
      await time.increase(31 * 24 * 60 * 60);

      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await donation.withdraw(0);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(owner.address);

      expect(balanceAfter + gasUsed - balanceBefore).to.equal(ethers.parseEther("0.5"));

      const campaign = await donation.getCampaign(0);
      expect(campaign.isActive).to.be.false;
      expect(campaign.raisedAmount).to.equal(0);
    });

    it("마감 전 인출 시도하면 revert", async function () {
      await expect(
        donation.withdraw(0)
      ).to.be.revertedWithCustomError(donation, "DeadlineNotPassed");
    });

    it("생성자가 아닌 사람이 인출하면 revert", async function () {
      await time.increase(31 * 24 * 60 * 60);

      await expect(
        donation.connect(donor1).withdraw(0)
      ).to.be.revertedWithCustomError(donation, "NotCampaignCreator");
    });
  });

  // ═══════════════════════════════════
  // 캠페인 삭제 (비활성화) + 자동 환불
  // ═══════════════════════════════════
  describe("캠페인 삭제 및 환불", function () {
    beforeEach(async function () {
      await donation.createCampaign(
        "삭제 테스트", "설명", "", ethers.parseEther("1"), 30
      );
    });

    it("관리자가 캠페인을 삭제할 수 있다", async function () {
      await expect(donation.deactivateCampaign(0))
        .to.emit(donation, "CampaignDeactivated")
        .withArgs(0, owner.address);

      const campaign = await donation.getCampaign(0);
      expect(campaign.isActive).to.be.false;
    });

    it("캠페인 생성자도 본인 캠페인을 삭제할 수 있다", async function () {
      // donor1이 캠페인 생성
      await donation.connect(donor1).createCampaign(
        "donor1 캠페인", "", "", ethers.parseEther("1"), 30
      );

      await expect(donation.connect(donor1).deactivateCampaign(1))
        .to.emit(donation, "CampaignDeactivated");
    });

    it("권한 없는 사용자가 삭제하면 revert", async function () {
      await expect(
        donation.connect(other).deactivateCampaign(0)
      ).to.be.revertedWithCustomError(donation, "NotAuthorized");
    });

    it("삭제 시 기부금이 기부자에게 자동 환불된다", async function () {
      // 기부 진행
      await donation.connect(donor1).donate(0, "기부1", {
        value: ethers.parseEther("0.3"),
      });
      await donation.connect(donor2).donate(0, "기부2", {
        value: ethers.parseEther("0.2"),
      });

      const donor1Before = await ethers.provider.getBalance(donor1.address);
      const donor2Before = await ethers.provider.getBalance(donor2.address);

      // 캠페인 삭제 → 환불
      await donation.deactivateCampaign(0);

      const donor1After = await ethers.provider.getBalance(donor1.address);
      const donor2After = await ethers.provider.getBalance(donor2.address);

      // 환불 확인
      expect(donor1After - donor1Before).to.equal(ethers.parseEther("0.3"));
      expect(donor2After - donor2Before).to.equal(ethers.parseEther("0.2"));

      // 캠페인 잔액 0 확인
      const campaign = await donation.getCampaign(0);
      expect(campaign.raisedAmount).to.equal(0);
      expect(campaign.isActive).to.be.false;
    });

    it("이미 비활성화된 캠페인을 다시 삭제하면 revert", async function () {
      await donation.deactivateCampaign(0);

      await expect(
        donation.deactivateCampaign(0)
      ).to.be.revertedWithCustomError(donation, "CampaignNotActive");
    });
  });
});
