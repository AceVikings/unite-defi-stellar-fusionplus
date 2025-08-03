// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IFusionPlus
 * @dev Main interface for the Fusion+ protocol
 */
interface IFusionPlus {
    struct Order {
        uint256 salt;           // Order salt for extension integrity
        address makerAsset;     // Asset to be swapped by maker
        address takerAsset;     // Asset to be swapped by taker  
        address maker;          // Order creator
        address receiver;       // Funds recipient (can be different from maker)
        address allowedSender;  // Permitted taker (zero for public orders)
        uint256 makingAmount;   // Amount of maker asset
        uint256 takingAmount;   // Amount of taker asset
        uint256 offsets;        // Encoded offsets for makerTraits and extension
        bytes interactions;     // Encoded interactions data
    }

    /**
     * @dev Fill an order with signature verification
     */
    function fillOrder(
        Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 takerTraits
    ) external payable returns (uint256 actualMakingAmount, uint256 actualTakingAmount);

    /**
     * @dev Create source chain escrow
     */
    function createSrcEscrow(
        bytes32 orderHash,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker
    ) external payable returns (address escrow);

    /**
     * @dev Create destination chain escrow
     */
    function createDstEscrow(
        bytes32 orderHash,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker
    ) external payable returns (address escrow);
}
