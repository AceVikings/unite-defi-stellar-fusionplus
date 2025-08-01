import { ethers } from "hardhat";
import { Contract } from "ethers";

async function main() {
  console.log("Starting deployment to local network...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", await deployer.getAddress());
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.getAddress())));

  // Deploy MockERC20 for testing
  console.log("\n1. Deploying MockERC20 test token...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy(
    "Test Token",
    "TEST",
    18,
    ethers.parseEther("1000000")
  );
  await mockToken.waitForDeployment();
  console.log("MockERC20 deployed to:", await mockToken.getAddress());

  // Deploy CrossChainHTLC
  console.log("\n2. Deploying CrossChainHTLC...");
  const CrossChainHTLC = await ethers.getContractFactory("CrossChainHTLC");
  const htlc = await CrossChainHTLC.deploy();
  await htlc.waitForDeployment();
  console.log("CrossChainHTLC deployed to:", await htlc.getAddress());

  // Setup test accounts with tokens
  console.log("\n3. Setting up test accounts...");
  const [, alice, bob] = await ethers.getSigners();
  
  if (alice && bob) {
    const testAmount = ethers.parseEther("1000");
    await mockToken.transfer(await alice.getAddress(), testAmount);
    await mockToken.transfer(await bob.getAddress(), testAmount);
    
    console.log("Distributed test tokens:");
    console.log("- Alice:", await alice.getAddress(), "- Balance:", ethers.formatEther(await mockToken.balanceOf(alice.getAddress())));
    console.log("- Bob:", await bob.getAddress(), "- Balance:", ethers.formatEther(await mockToken.balanceOf(bob.getAddress())));
  }

  // Save deployment info
  const deploymentInfo = {
    network: "localhost",
    chainId: (await ethers.provider.getNetwork()).chainId,
    contracts: {
      CrossChainHTLC: {
        address: await htlc.getAddress(),
        deployer: await deployer.getAddress(),
      },
      MockERC20: {
        address: await mockToken.getAddress(),
        deployer: await deployer.getAddress(),
      }
    },
    accounts: {
      deployer: await deployer.getAddress(),
      alice: alice ? await alice.getAddress() : null,
      bob: bob ? await bob.getAddress() : null,
    },
    timestamp: new Date().toISOString(),
  };

  console.log("\n4. Deployment Summary:");
  console.log("=".repeat(50));
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log("=".repeat(50));

  // Basic functionality test
  console.log("\n5. Running basic functionality test...");
  try {
    const currentTime = await htlc.getCurrentTime();
    console.log("✅ Contract is responsive. Current time:", currentTime.toString());
    
    const contractBalance = await htlc.getContractBalance();
    console.log("✅ Contract balance:", ethers.formatEther(contractBalance), "ETH");
    
    console.log("✅ Deployment completed successfully!");
  } catch (error) {
    console.error("❌ Post-deployment test failed:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
