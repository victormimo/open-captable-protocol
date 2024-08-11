pragma solidity ^0.8.20;

import {Stakeholder} from "../lib/Structs.sol";

struct StakeholderStorage {
    Stakeholder[] stakeholders;
    mapping(address => bytes16) walletsPerStakeholder;
    mapping(bytes16 => uint256) stakeholderIndex;
}

library StakeHolderLib {
    event StakeholderCreated(bytes16 indexed id);

    error StakeholderAlreadyExists(bytes16 stakeholder_id);
    error NoStakeholder(bytes16 stakeholder_id);
    error InvalidWallet(address wallet);
    error WalletAlreadyExists(address wallet);

    function _s() internal pure returns (StakeholderStorage storage s) {
        bytes32 slot = keccak256("storage.slot.stakeholders");
        assembly {
            s.slot := slot
        }
    }

    function _checkInvalidWallet(address _wallet) internal pure {
        if (_wallet == address(0)) {
            revert InvalidWallet(_wallet);
        }
    }

    function _checkStakeholderIsStored(bytes16 _id) internal view {
        if (_s().stakeholderIndex[_id] == 0) {
            revert NoStakeholder(_id);
        }
    }

    function _checkStakeholderExists(bytes16 _id) internal view {
        if (_s().stakeholderIndex[_id] > 0) {
            revert StakeholderAlreadyExists(_id);
        }
    }

    function _checkWalletAlreadyExists(address _wallet) internal view {
        if (_s().walletsPerStakeholder[_wallet] != bytes16(0)) {
            revert WalletAlreadyExists(_wallet);
        }
    }

    function _createStakeholder(bytes16 _id, string memory _stakeholder_type, string memory _current_relationship)
        internal
    {
        _checkStakeholderExists(_id);

        _s().stakeholders.push(Stakeholder(_id, _stakeholder_type, _current_relationship));
        _s().stakeholderIndex[_id] = _s().stakeholders.length;
        emit StakeholderCreated(_id);
    }

    function _getStakeholderById(bytes16 _id) internal view returns (bytes16, string memory, string memory) {
        if (_s().stakeholderIndex[_id] > 0) {
            Stakeholder memory stakeholder = _s().stakeholders[_s().stakeholderIndex[_id] - 1];
            return (stakeholder.id, stakeholder.stakeholder_type, stakeholder.current_relationship);
        } else {
            return ("", "", "");
        }
    }

    function _getStakeholderId(uint256 idx) internal view returns (bytes16) {
        return _s().stakeholders[idx].id;
    }

    function _getTotalNumberOfStakeholders() internal view returns (uint256) {
        return _s().stakeholders.length;
    }

    function _getStakeholderIdByWallet(address _wallet) internal view returns (bytes16 stakeholderId) {
        require(_s().walletsPerStakeholder[_wallet] != bytes16(0), "No stakeholder found");
        return _s().walletsPerStakeholder[_wallet];
    }

    function _addWalletToStakeholder(bytes16 _stakeholder_id, address _wallet) internal {
        _checkInvalidWallet(_wallet);
        _checkStakeholderIsStored(_stakeholder_id);
        _checkWalletAlreadyExists(_wallet);

        _s().walletsPerStakeholder[_wallet] = _stakeholder_id;
    }

    function _removeWalletFromStakeholder(bytes16 _stakeholder_id, address _wallet) internal {
        _checkInvalidWallet(_wallet);
        _checkStakeholderIsStored(_stakeholder_id);

        delete _s().walletsPerStakeholder[_wallet];
    }
}
