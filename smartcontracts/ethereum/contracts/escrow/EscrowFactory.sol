// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IEscrow.sol";

/**
 * @title EscrowFactory
 * @dev Factory for deploying minimal escrow proxies for gas efficiency
 */
contract EscrowFactory is Ownable {
    
    address public immutable escrowImplementation;
    
    // Mapping from salt to deployed escrow address
    mapping(bytes32 => address) public deployedEscrows;
    
    // Events
    event EscrowDeployed(
        bytes32 indexed salt,
        address indexed escrow,
        bytes32 indexed orderHash,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker,
        bool isSource
    );
    
    // Errors
    error EscrowAlreadyExists();
    error InvalidImplementation();
    
    constructor(address _implementation) Ownable(msg.sender) {
        if (_implementation == address(0)) {
            revert InvalidImplementation();
        }
        
        escrowImplementation = _implementation;
    }

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
    ) external returns (address escrow) {
        bytes32 salt = keccak256(abi.encode(
            orderHash, token, amount, hashlock, timelock, maker, taker, true // true for source
        ));
        
        if (deployedEscrows[salt] != address(0)) {
            revert EscrowAlreadyExists();
        }
        
        escrow = Clones.cloneDeterministic(escrowImplementation, salt);
        deployedEscrows[salt] = escrow;
        
        // Initialize escrow without transferring tokens yet
        IEscrow(escrow).initializeWithoutFunding(
            token,
            amount,
            hashlock,
            timelock,
            maker,
            taker
        );
        
        emit EscrowDeployed(
            salt,
            escrow,
            orderHash,
            token,
            amount,
            hashlock,
            timelock,
            maker,
            taker,
            true
        );
        
        return escrow;
    }
    
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
    ) external payable returns (address escrow) {
        bytes32 salt = keccak256(abi.encode(
            orderHash, token, amount, hashlock, timelock, maker, taker, false // false for destination
        ));
        
        if (deployedEscrows[salt] != address(0)) {
            revert EscrowAlreadyExists();
        }
        
        escrow = Clones.cloneDeterministic(escrowImplementation, salt);
        deployedEscrows[salt] = escrow;
        
        // Initialize escrow without transferring tokens yet
        IEscrow(escrow).initializeWithoutFunding(
            token,
            amount,
            hashlock,
            timelock,
            maker,
            taker
        );
        
        emit EscrowDeployed(
            salt,
            escrow,
            orderHash,
            token,
            amount,
            hashlock,
            timelock,
            maker,
            taker,
            false
        );
        
        return escrow;
    }

    /**
     * @dev Predict escrow address before deployment
     */
    function predictEscrowAddress(
        bytes32 orderHash,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker,
        bool isSource
    ) external view returns (address predicted) {
        bytes32 salt = keccak256(abi.encode(
            orderHash, token, amount, hashlock, timelock, maker, taker, isSource
        ));
        
        return Clones.predictDeterministicAddress(escrowImplementation, salt, address(this));
    }

    /**
     * @dev Check if escrow exists for given parameters
     */
    function escrowExists(
        bytes32 orderHash,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker,
        bool isSource
    ) external view returns (bool exists) {
        bytes32 salt = keccak256(abi.encode(
            orderHash, token, amount, hashlock, timelock, maker, taker, isSource
        ));
        return deployedEscrows[salt] != address(0);
    }

    /**
     * @dev Get escrow address for given parameters
     */
    function getEscrowAddress(
        bytes32 orderHash,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker,
        bool isSource
    ) external view returns (address escrow) {
        bytes32 salt = keccak256(abi.encode(
            orderHash, token, amount, hashlock, timelock, maker, taker, isSource
        ));
        return deployedEscrows[salt];
    }
}