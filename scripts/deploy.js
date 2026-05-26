const hre = require("hardhat");

async function main() {
  console.log("🚀 TransparentDonation 배포 시작...");
  const factory = await hre.ethers.getContractFactory("TransparentDonation");
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`✅ 배포 완료: ${address}`);
  console.log(`   네트워크: ${hre.network.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
