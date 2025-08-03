// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DutchAuctionCalculator
 * @dev Calculator for Dutch auction price calculations in Fusion orders
 */
contract DutchAuctionCalculator {
    
    struct AuctionDetails {
        uint256 startTime;      // Auction start timestamp
        uint256 duration;       // Duration in seconds
        uint256 startPrice;     // Starting price
        uint256 endPrice;       // Ending price (minimum)
        uint256 gasPrice;       // Gas price for calculation
        uint256 gasCost;        // Estimated gas cost
    }

    /**
     * @dev Calculate current price in a Dutch auction
     * @param startTime When the auction started
     * @param duration How long the auction lasts
     * @param startPrice Starting price
     * @param endPrice Minimum price
     * @param currentTime Current timestamp
     * @return currentPrice The calculated current price
     */
    function calculatePrice(
        uint256 startTime,
        uint256 duration,
        uint256 startPrice,
        uint256 endPrice,
        uint256 currentTime
    ) public pure returns (uint256 currentPrice) {
        // If auction hasn't started, return start price
        if (currentTime <= startTime) {
            return startPrice;
        }
        
        // If auction has ended, return end price
        if (currentTime >= startTime + duration) {
            return endPrice;
        }
        
        // Calculate linearly decreasing price
        uint256 elapsed = currentTime - startTime;
        uint256 priceRange = startPrice - endPrice;
        uint256 discount = (priceRange * elapsed) / duration;
        
        return startPrice - discount;
    }

    /**
     * @dev Calculate current price with gas adjustments
     * @param auction The auction parameters
     * @param currentTime Current timestamp
     * @return currentPrice The gas-adjusted current price
     */
    function calculatePriceWithGas(
        AuctionDetails memory auction,
        uint256 currentTime
    ) external pure returns (uint256 currentPrice) {
        uint256 basePrice = calculatePrice(
            auction.startTime,
            auction.duration,
            auction.startPrice,
            auction.endPrice,
            currentTime
        );
        
        // Add gas cost compensation
        uint256 gasCost = auction.gasCost * auction.gasPrice;
        return basePrice + gasCost;
    }

    /**
     * @dev Calculate auction parameters from encoded data
     * @param auctionData Encoded auction parameters
     * @return auction Decoded auction details
     */
    function decodeAuctionData(bytes calldata auctionData) 
        external 
        pure 
        returns (AuctionDetails memory auction) 
    {
        require(auctionData.length >= 192, "Invalid auction data length");
        
        assembly {
            let offset := auctionData.offset
            mstore(auction, calldataload(offset))                    // startTime
            mstore(add(auction, 0x20), calldataload(add(offset, 0x20))) // duration
            mstore(add(auction, 0x40), calldataload(add(offset, 0x40))) // startPrice
            mstore(add(auction, 0x60), calldataload(add(offset, 0x60))) // endPrice
            mstore(add(auction, 0x80), calldataload(add(offset, 0x80))) // gasPrice
            mstore(add(auction, 0xa0), calldataload(add(offset, 0xa0))) // gasCost
        }
    }

    /**
     * @dev Encode auction parameters
     * @param auction The auction details to encode
     * @return auctionData Encoded auction parameters
     */
    function encodeAuctionData(AuctionDetails memory auction) 
        external 
        pure 
        returns (bytes memory auctionData) 
    {
        return abi.encode(
            auction.startTime,
            auction.duration,
            auction.startPrice,
            auction.endPrice,
            auction.gasPrice,
            auction.gasCost
        );
    }

    /**
     * @dev Check if auction is active
     * @param startTime Auction start time
     * @param duration Auction duration
     * @param currentTime Current timestamp
     * @return isActive True if auction is currently active
     */
    function isAuctionActive(
        uint256 startTime,
        uint256 duration,
        uint256 currentTime
    ) external pure returns (bool isActive) {
        return currentTime >= startTime && currentTime < startTime + duration;
    }

    /**
     * @dev Calculate time remaining in auction
     * @param startTime Auction start time
     * @param duration Auction duration
     * @param currentTime Current timestamp
     * @return timeRemaining Seconds remaining (0 if ended)
     */
    function getTimeRemaining(
        uint256 startTime,
        uint256 duration,
        uint256 currentTime
    ) external pure returns (uint256 timeRemaining) {
        if (currentTime < startTime) {
            return duration;
        }
        
        uint256 endTime = startTime + duration;
        if (currentTime >= endTime) {
            return 0;
        }
        
        return endTime - currentTime;
    }

    /**
     * @dev Calculate price at specific progress point (0-100%)
     * @param startPrice Starting price
     * @param endPrice Ending price
     * @param progressBps Progress in basis points (0-10000)
     * @return price Price at given progress
     */
    function getPriceAtProgress(
        uint256 startPrice,
        uint256 endPrice,
        uint256 progressBps
    ) external pure returns (uint256 price) {
        require(progressBps <= 10000, "Progress must be <= 100%");
        
        if (progressBps == 0) return startPrice;
        if (progressBps == 10000) return endPrice;
        
        uint256 priceRange = startPrice - endPrice;
        uint256 discount = (priceRange * progressBps) / 10000;
        
        return startPrice - discount;
    }
}
