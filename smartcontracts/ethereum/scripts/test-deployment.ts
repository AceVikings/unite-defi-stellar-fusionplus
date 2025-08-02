import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Testing deployed HTLC contract...");

  // Get deployment info
  const deploymentDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentDir)) {
    console.error("❌ No deployments found");
    process.exit(1);
  }

  const deploymentFiles = fs
    .readdirSync(deploymentDir)
    .filter((f) => f.endsWith(".json"));
  if (deploymentFiles.length === 0) {
    console.error("❌ No deployment files found");
    process.exit(1);
  }

  // Use the latest deployment
  const latestDeployment = deploymentFiles.sort().pop()!;
  const deploymentInfo = JSON.parse(
    fs.readFileSync(path.join(deploymentDir, latestDeployment), "utf8")
  );

  console.log("Using deployment:", latestDeployment);
  console.log("HTLC Address:", deploymentInfo.contracts.CrossChainHTLC.address);
  console.log("Token Address:", deploymentInfo.contracts.MockERC20.address);

  // Connect to contracts
  const htlc = await ethers.getContractAt(
    "CrossChainHTLC",
    deploymentInfo.contracts.CrossChainHTLC.address
  );
  const mockToken = await ethers.getContractAt(
    "MockERC20",
    deploymentInfo.contracts.MockERC20.address
  );

  const [deployer, alice, bob] = await ethers.getSigners();

  console.log("\n1. Testing basic contract functions...");

  // Test current time
  const currentTime = await htlc.getCurrentTime();
  console.log(
    "✅ Current time:",
    new Date(Number(currentTime) * 1000).toISOString()
  );

  // Test balances
  const ethBalance = await htlc.getContractBalance();
  const tokenBalance = await htlc.getTokenBalance(
    deploymentInfo.contracts.MockERC20.address
  );
  console.log("✅ Contract ETH balance:", ethers.formatEther(ethBalance));
  console.log("✅ Contract token balance:", ethers.formatEther(tokenBalance));

  console.log("\n2. Testing token operations...");

  // Ensure alice has tokens
  const aliceBalance = await mockToken.balanceOf(alice.getAddress());
  console.log("Alice token balance:", ethers.formatEther(aliceBalance));

  if (aliceBalance < ethers.parseEther("100")) {
    console.log("Minting tokens for Alice...");
    await mockToken
      .connect(deployer)
      .mint(alice.getAddress(), ethers.parseEther("1000"));
    console.log("✅ Tokens minted for Alice");
  }

  console.log("\n3. Testing HTLC swap creation...");

  // Create test parameters
  const lockAmount = ethers.parseEther("10");
  const secret = "0x" + "a".repeat(64); // 32 bytes
  const hashlock = ethers.keccak256(ethers.toUtf8Bytes(secret));
  const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

  // Approve tokens
  console.log("Approving tokens...");
  await mockToken
    .connect(alice)
    .approve(deploymentInfo.contracts.CrossChainHTLC.address, lockAmount);
  console.log("✅ Tokens approved");

  // Create swap
  console.log("Creating HTLC swap...");
  const tx = await htlc
    .connect(alice)
    .lockFunds(
      await bob.getAddress(),
      await deploymentInfo.contracts.MockERC20.address,
      lockAmount,
      hashlock,
      timelock
    );

  const receipt = await tx.wait();
  console.log("✅ Swap created. Transaction hash:", receipt?.hash);

  // Find the swap ID from events
  const event = receipt?.logs.find((log: any) => {
    try {
      const parsedLog = htlc.interface.parseLog(log);
      return parsedLog?.name === "FundsLocked";
    } catch {
      return false;
    }
  });

  if (!event) {
    console.error("❌ Could not find FundsLocked event");
    return;
  }

  const parsedEvent = htlc.interface.parseLog(event);
  const swapId = parsedEvent?.args.swapId;
  console.log("✅ Swap ID:", swapId);

  // Get swap data
  console.log("\n4. Testing swap data retrieval...");
  const swapData = await htlc.getSwapData(swapId);
  console.log("✅ Swap data retrieved:");
  console.log("  - Sender:", swapData.sender);
  console.log("  - Recipient:", swapData.recipient);
  console.log("  - Amount:", ethers.formatEther(swapData.amount));
  console.log(
    "  - Timelock:",
    new Date(Number(swapData.timelock) * 1000).toISOString()
  );
  console.log("  - Claimed:", swapData.claimed);
  console.log("  - Refunded:", swapData.refunded);

  console.log("\n5. Testing claim functionality...");

  const bobBalanceBefore = await mockToken.balanceOf(bob.getAddress());
  console.log(
    "Bob balance before claim:",
    ethers.formatEther(bobBalanceBefore)
  );

  // Claim the swap
  const claimTx = await htlc.connect(bob).claimFunds(swapId, secret);
  await claimTx.wait();
  console.log("✅ Funds claimed. Transaction hash:", claimTx.hash);

  const bobBalanceAfter = await mockToken.balanceOf(bob.getAddress());
  console.log("Bob balance after claim:", ethers.formatEther(bobBalanceAfter));
  console.log(
    "Amount received:",
    ethers.formatEther(bobBalanceAfter - bobBalanceBefore)
  );

  // Verify swap is completed
  const updatedSwapData = await htlc.getSwapData(swapId);
  console.log("✅ Swap status after claim:");
  console.log("  - Claimed:", updatedSwapData.claimed);
  console.log(
    "  - Preimage revealed:",
    updatedSwapData.preimage !== ethers.ZeroHash
  );

  console.log("\n6. Testing user swaps tracking...");
  const aliceSwaps = await htlc.getUserSwaps(alice.getAddress());
  console.log("✅ Alice has", aliceSwaps.length, "swap(s)");

  console.log("\n✅ All tests completed successfully!");
  console.log("\n📊 Test Summary:");
  console.log("- Contract deployment: ✅ Working");
  console.log("- Token operations: ✅ Working");
  console.log("- HTLC creation: ✅ Working");
  console.log("- Fund claiming: ✅ Working");
  console.log("- Data retrieval: ✅ Working");
  console.log("- Event emission: ✅ Working");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
