// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IOrderExtension.sol";
import "./DutchAuctionCalculator.sol";

/**
 * @title FusionExtension
 * @dev Extension for Fusion orders with Dutch auction functionality
 */
contract FusionExtension is IOrderExtension {
    
    DutchAuctionCalculator public immutable calculator;
    
    // Events
    event AuctionStarted(bytes32 indexed orderHash, uint256 startTime, uint256 startPrice);
    event PriceUpdated(bytes32 indexed orderHash, uint256 newPrice, uint256 timestamp);
    
    // Errors
    error AuctionNotActive();
    error InvalidAuctionData();
    error PriceTooLow();
    
    constructor(address _calculator) {
        calculator = DutchAuctionCalculator(_calculator);
    }

    /**
     * @dev Pre-interaction hook for auction validation
     * @param order The order being filled
     * @param extension Extension data containing auction parameters
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
    ) external override {
        // Decode auction data from extension
        DutchAuctionCalculator.AuctionDetails memory auction = 
            calculator.decodeAuctionData(extension);
        
        // Validate auction is active
        if (!calculator.isAuctionActive(auction.startTime, auction.duration, block.timestamp)) {
            revert AuctionNotActive();
        }
        
        // Calculate current minimum price
        uint256 currentPrice = calculator.calculatePriceWithGas(auction, block.timestamp);
        
        // Validate taker is paying at least the current auction price
        // Price is calculated as takingAmount per makingAmount
        uint256 offeredPrice = (takingAmount * 1e18) / makingAmount;
        if (offeredPrice < currentPrice) {
            revert PriceTooLow();
        }
        
        emit PriceUpdated(orderHash, currentPrice, block.timestamp);
    }

    /**
     * @dev Post-interaction hook (can be used for additional logic)
     * @param order The order being filled
     * @param extension Extension data containing auction parameters
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
    ) external override {
        // Post-interaction logic can be implemented here
        // For example: update resolver statistics, emit events, etc.
    }

    /**
     * @dev Get current auction price for an order
     * @param extension Extension data containing auction parameters
     * @return currentPrice The current auction price
     */
    function getCurrentPrice(bytes calldata extension) 
        external 
        view 
        returns (uint256 currentPrice) 
    {
        DutchAuctionCalculator.AuctionDetails memory auction = 
            calculator.decodeAuctionData(extension);
        
        return calculator.calculatePriceWithGas(auction, block.timestamp);
    }

    /**
     * @dev Check if auction is currently active
     * @param extension Extension data containing auction parameters
     * @return isActive True if auction is active
     */
    function isAuctionActive(bytes calldata extension) 
        external 
        view 
        returns (bool isActive) 
    {
        DutchAuctionCalculator.AuctionDetails memory auction = 
            calculator.decodeAuctionData(extension);
        
        return calculator.isAuctionActive(auction.startTime, auction.duration, block.timestamp);
    }

    /**
     * @dev Get time remaining in auction
     * @param extension Extension data containing auction parameters
     * @return timeRemaining Seconds remaining in auction
     */
    function getTimeRemaining(bytes calldata extension) 
        external 
        view 
        returns (uint256 timeRemaining) 
    {
        DutchAuctionCalculator.AuctionDetails memory auction = 
            calculator.decodeAuctionData(extension);
        
        return calculator.getTimeRemaining(auction.startTime, auction.duration, block.timestamp);
    }

    /**
     * @dev Create extension data for a new auction
     * @param startTime When the auction should start
     * @param duration How long the auction should last
     * @param startPrice Starting price for the auction
     * @param endPrice Minimum price for the auction
     * @param gasPrice Current gas price
     * @param gasCost Estimated gas cost
     * @return extensionData Encoded extension data
     */
    function createAuctionExtension(
        uint256 startTime,
        uint256 duration,
        uint256 startPrice,
        uint256 endPrice,
        uint256 gasPrice,
        uint256 gasCost
    ) external view returns (bytes memory extensionData) {
        require(startPrice > endPrice, "Invalid price range");
        require(duration > 0, "Invalid duration");
        
        DutchAuctionCalculator.AuctionDetails memory auction = 
            DutchAuctionCalculator.AuctionDetails({
                startTime: startTime,
                duration: duration,
                startPrice: startPrice,
                endPrice: endPrice,
                gasPrice: gasPrice,
                gasCost: gasCost
            });
        
        return calculator.encodeAuctionData(auction);
    }
}
