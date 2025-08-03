// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IEscrow
 * @dev Interface for escrow contracts in cross-chain atomic swaps
 */
interface IEscrow {
    /**
     * @dev Initialize the escrow with immutable parameters
     * @param token Token address (address(0) for ETH)
     * @param amount Amount of tokens/ETH to escrow
     * @param hashlock Hash of the secret
     * @param timelock Expiration timestamp
     * @param maker Order maker address
     * @param taker Order taker address
     */
    function initialize(
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker
    ) external payable;
    
    /**
     * @dev Initialize the escrow without funding (funds transferred separately)
     * @param token Token address (address(0) for ETH)
     * @param amount Amount of tokens/ETH to escrow
     * @param hashlock Hash of the secret
     * @param timelock Expiration timestamp
     * @param maker Order maker address
     * @param taker Order taker address
     */
    function initializeWithoutFunding(
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker
    ) external;
    
    /**
     * @dev Fund the escrow (called after initialization)
     * @param amount Amount to fund (for validation)
     */
    function fund(uint256 amount) external payable;
    
    /**
     * @dev Mark escrow as funded when tokens are transferred directly
     */
    function markAsFunded() external;
    
    /**
     * @dev Withdraw funds by revealing the preimage
     * @param preimage The secret that hashes to hashlock
     */
    function withdraw(bytes32 preimage) external;
    
    /**
     * @dev Refund funds after timelock expiry
     */
    function refund() external;
    
    /**
     * @dev Get escrow state
     */
    function getState() external view returns (
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker,
        bool withdrawn,
        bool refunded
    );
    
    /**
     * @dev Get revealed secret (if completed)
     */
    function getRevealedSecret() external view returns (bytes32);
}
