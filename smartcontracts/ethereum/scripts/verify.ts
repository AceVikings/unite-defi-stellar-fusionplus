import { ethers } from "hardhat";
import { run } from "hardhat";

async function main() {
  const contractAddress = process.argv[2];
  const constructorArgs = process.argv.slice(3);

  if (!contractAddress) {
    console.error("Please provide the contract address as the first argument");
    process.exit(1);
  }

  console.log("Verifying contract:", contractAddress);
  console.log("Constructor arguments:", constructorArgs);

  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: constructorArgs,
    });

    console.log("✅ Contract verified successfully!");
  } catch (error: any) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log("✅ Contract already verified!");
    } else {
      console.error("❌ Verification failed:", error);
      process.exit(1);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
