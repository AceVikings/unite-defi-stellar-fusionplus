import { ethers } from "hardhat";
import { Contract } from "ethers";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Starting deployment to Sepolia testnet...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", await deployer.getAddress());

  const balance = await ethers.provider.getBalance(deployer.getAddress());
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.01")) {
    console.error(
      "❌ Insufficient balance for deployment. Need at least 0.01 ETH"
    );
    process.exit(1);
  }

  // Get network info
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "Chain ID:", network.chainId);

  if (network.chainId !== 11155111n) {
    console.error("❌ Not connected to Sepolia testnet");
    process.exit(1);
  }

  // Deploy CrossChainHTLC
  console.log("\n1. Deploying CrossChainHTLC...");
  const CrossChainHTLC = await ethers.getContractFactory("CrossChainHTLC");

  console.log("Estimating gas...");
  const deployTx = await CrossChainHTLC.getDeployTransaction(
    await deployer.getAddress()
  ); // Add fee recipient parameter
  const gasEstimate = await ethers.provider.estimateGas(deployTx);
  console.log("Estimated gas:", gasEstimate.toString());

  const htlc = await CrossChainHTLC.deploy(await deployer.getAddress(), {
    // Add fee recipient parameter
    gasLimit: (gasEstimate * 110n) / 100n, // Add 10% buffer
  });

  console.log("Transaction hash:", htlc.deploymentTransaction()?.hash);
  console.log("Waiting for deployment confirmation...");

  await htlc.waitForDeployment();
  const htlcAddress = await htlc.getAddress();
  console.log("✅ CrossChainHTLC deployed to:", htlcAddress);

  // Deploy MockERC20 for testing (optional)
  console.log("\n2. Deploying MockERC20 test token...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy(
    "Sepolia Test Token",
    "STEST",
    18,
    ethers.parseEther("1000000"),
    {
      gasLimit: (gasEstimate * 110n) / 100n,
    }
  );

  await mockToken.waitForDeployment();
  const tokenAddress = await mockToken.getAddress();
  console.log("✅ MockERC20 deployed to:", tokenAddress);

  // Wait for a few confirmations
  console.log("\n3. Waiting for confirmations...");
  await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds

  // Verify deployment
  console.log("\n4. Verifying deployment...");
  try {
    const currentTime = await htlc.getCurrentTime();
    console.log(
      "✅ HTLC contract is responsive. Current time:",
      currentTime.toString()
    );

    const tokenName = await mockToken.name();
    console.log("✅ Token contract is responsive. Name:", tokenName);
  } catch (error) {
    console.error("❌ Contract verification failed:", error);
  }

  // Save deployment info
  const deploymentInfo = {
    network: "sepolia",
    chainId: network.chainId.toString(),
    contracts: {
      CrossChainHTLC: {
        address: htlcAddress,
        deployer: await deployer.getAddress(),
        deploymentHash: htlc.deploymentTransaction()?.hash,
      },
      MockERC20: {
        address: tokenAddress,
        deployer: await deployer.getAddress(),
        deploymentHash: mockToken.deploymentTransaction()?.hash,
      },
    },
    timestamp: new Date().toISOString(),
  };

  // Save to file
  const deploymentDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentDir, `sepolia-${Date.now()}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n5. Deployment Summary:");
  console.log("=".repeat(50));
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log("=".repeat(50));
  console.log(`\n📁 Deployment info saved to: ${deploymentFile}`);

  console.log("\n6. Next Steps:");
  console.log("1. Verify contracts on Etherscan:");
  console.log(`   npx hardhat verify --network sepolia ${htlcAddress}`);
  console.log(
    `   npx hardhat verify --network sepolia ${tokenAddress} "Sepolia Test Token" "STEST" 18 "1000000000000000000000000"`
  );
  console.log("\n2. Test the deployment:");
  console.log(
    `   npx hardhat run scripts/test-deployment.ts --network sepolia`
  );

  console.log("\n✅ Sepolia deployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
