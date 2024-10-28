// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Stakeholder} from "../lib/Structs.sol";
import {StakeHolderLib} from "../lib/StakeHolderLib.sol";
import {CAPAccessControlFacet} from "./CAPAccessControlFacet.sol";

contract StakeHolderFacet is CAPAccessControlFacet {
    function createStakeholder(bytes16 _id, string memory _stakeholder_type, string memory _current_relationship)
        external
        onlyAdmin
    {
        StakeHolderLib._createStakeholder(_id, _stakeholder_type, _current_relationship);
    }

    function getStakeholderById(bytes16 _id) external view returns (bytes16, string memory, string memory) {
        return StakeHolderLib._getStakeholderById(_id);
    }

    function getTotalNumberOfStakeholders() external view returns (uint256) {
        return StakeHolderLib._getTotalNumberOfStakeholders();
    }

    function getStakeholderIdByWallet(address _wallet) external view returns (bytes16 stakeholderId) {
        return StakeHolderLib._getStakeholderIdByWallet(_wallet);
    }

    /// @notice Setter for walletsPerStakeholder mapping
    /// @dev Function is separate from createStakeholder since multiple wallets will be added per stakeholder at different times.
    function addWalletToStakeholder(bytes16 _stakeholder_id, address _wallet) external onlyOperator {
        StakeHolderLib._addWalletToStakeholder(_stakeholder_id, _wallet);
    }

    /// @notice Removing wallet from walletsPerStakeholder mapping
    function removeWalletFromStakeholder(bytes16 _stakeholder_id, address _wallet) external onlyOperator {
        StakeHolderLib._removeWalletFromStakeholder(_stakeholder_id, _wallet);
    }
}
