// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IOrderExtension
 * @dev Interface for order extensions in the Limit Order Protocol
 * @notice Extensions allow for programmable order logic and custom interactions
 */
interface IOrderExtension {
    /**
     * @dev Called before order settlement
     * @param order The order being filled
     * @param extension Extension data
     * @param orderHash Hash of the order
     * @param taker Address filling the order
     * @param makingAmount Amount being made
     * @param takingAmount Amount being taken
     */
    function preInteraction(
        bytes calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount
    ) external;
    
    /**
     * @dev Called after order settlement
     * @param order The order being filled
     * @param extension Extension data
     * @param orderHash Hash of the order
     * @param taker Address filling the order
     * @param makingAmount Amount being made
     * @param takingAmount Amount being taken
     */
    function postInteraction(
        bytes calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount
    ) external;
}
