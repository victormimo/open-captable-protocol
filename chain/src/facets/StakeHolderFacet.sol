pragma solidity ^0.8.20;

import {Stakeholder} from "../lib/Structs.sol";
import {CAPAccessControlFacet} from "./CAPAccessControlFacet.sol";

abstract contract StakeHolderFacet is CAPAccessControlFacet {
    Stakeholder[] public stakeholders;

    mapping(address => bytes16) public walletsPerStakeholder;

    mapping(bytes16 => uint256) public stakeholderIndex;

    event StakeholderCreated(bytes16 indexed id);

    error StakeholderAlreadyExists(bytes16 stakeholder_id);
    error NoStakeholder(bytes16 stakeholder_id);
    error InvalidWallet(address wallet);
    error WalletAlreadyExists(address wallet);

    function createStakeholder(bytes16 _id, string memory _stakeholder_type, string memory _current_relationship)
        external
        onlyAdmin
    {
        _checkStakeholderExists(_id);

        stakeholders.push(Stakeholder(_id, _stakeholder_type, _current_relationship));
        stakeholderIndex[_id] = stakeholders.length;
        emit StakeholderCreated(_id);
    }

    function getStakeholderById(bytes16 _id) external view returns (bytes16, string memory, string memory) {
        if (stakeholderIndex[_id] > 0) {
            Stakeholder memory stakeholder = stakeholders[stakeholderIndex[_id] - 1];
            return (stakeholder.id, stakeholder.stakeholder_type, stakeholder.current_relationship);
        } else {
            return ("", "", "");
        }
    }

    function getTotalNumberOfStakeholders() external view returns (uint256) {
        return stakeholders.length;
    }

    function getStakeholderIdByWallet(address _wallet) external view returns (bytes16 stakeholderId) {
        require(walletsPerStakeholder[_wallet] != bytes16(0), "No stakeholder found");
        return walletsPerStakeholder[_wallet];
    }

    /// @notice Setter for walletsPerStakeholder mapping
    /// @dev Function is separate from createStakeholder since multiple wallets will be added per stakeholder at different times.
    function addWalletToStakeholder(bytes16 _stakeholder_id, address _wallet) external onlyOperator {
        _checkInvalidWallet(_wallet);
        _checkStakeholderIsStored(_stakeholder_id);
        _checkWalletAlreadyExists(_wallet);

        walletsPerStakeholder[_wallet] = _stakeholder_id;
    }

    /// @notice Removing wallet from walletsPerStakeholder mapping
    function removeWalletFromStakeholder(bytes16 _stakeholder_id, address _wallet) external onlyOperator {
        _checkInvalidWallet(_wallet);
        _checkStakeholderIsStored(_stakeholder_id);

        delete walletsPerStakeholder[_wallet];
    }

    function _checkInvalidWallet(address _wallet) internal pure {
        if (_wallet == address(0)) {
            revert InvalidWallet(_wallet);
        }
    }

    function _checkStakeholderIsStored(bytes16 _id) internal view {
        if (stakeholderIndex[_id] == 0) {
            revert NoStakeholder(_id);
        }
    }

    function _checkStakeholderExists(bytes16 _id) internal view {
        if (stakeholderIndex[_id] > 0) {
            revert StakeholderAlreadyExists(_id);
        }
    }

    function _checkWalletAlreadyExists(address _wallet) internal view {
        if (walletsPerStakeholder[_wallet] != bytes16(0)) {
            revert WalletAlreadyExists(_wallet);
        }
    }
}
