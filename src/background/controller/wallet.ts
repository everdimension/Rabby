import * as ethUtil from 'ethereumjs-util';
import Wallet, { thirdparty } from 'ethereumjs-wallet';
import { ethErrors } from 'eth-rpc-errors';
import * as bip39 from 'bip39';
import { ethers, Contract } from 'ethers';
import { groupBy } from 'lodash';
import {
  keyringService,
  preferenceService,
  notificationService,
  permissionService,
  sessionService,
  openapiService,
  pageStateCacheService,
  transactionHistoryService,
  contactBookService,
  signTextHistoryService,
  widgetService,
} from 'background/service';
import buildinProvider from 'background/utils/buildinProvider';
import { ContactBookItem } from '../service/contactBook';
import { openIndexPage } from 'background/webapi/tab';
import { CacheState } from 'background/service/pageStateCache';
import i18n from 'background/service/i18n';
import { KEYRING_CLASS, DisplayedKeryring } from 'background/service/keyring';
import providerController from './provider/controller';
import BaseController from './base';
import {
  KEYRING_WITH_INDEX,
  CHAINS,
  INTERNAL_REQUEST_ORIGIN,
  EVENTS,
  BRAND_ALIAN_TYPE_TEXT,
  WALLET_BRAND_CONTENT,
  CHAINS_ENUM,
} from 'consts';
import { ERC20ABI, ERC1155ABI, ERC721ABI } from 'consts/abi';
import { Account, ChainGas } from '../service/preference';
import { ConnectedSite } from '../service/permission';
import { ExplainTxResponse, TokenItem } from '../service/openapi';
import DisplayKeyring from '../service/keyring/display';
import provider from './provider';
import WalletConnectKeyring from '@rabby-wallet/eth-walletconnect-keyring';
import eventBus from '@/eventBus';
import {
  setPageStateCacheWhenPopupClose,
  isSameAddress,
} from 'background/utils';
import GnosisKeyring, {
  TransactionBuiltEvent,
  TransactionConfirmedEvent,
} from '../service/keyring/eth-gnosis-keyring';
import KeystoneKeyring, {
  AcquireMemeStoreData,
  MemStoreDataReady,
} from '../service/keyring/eth-keystone-keyring';
import stats from '@/stats';

const stashKeyrings: Record<string, any> = {};

export class WalletController extends BaseController {
  openapi = openapiService;

  /* wallet */
  boot = (password) => keyringService.boot(password);
  isBooted = () => keyringService.isBooted();
  verifyPassword = (password: string) =>
    keyringService.verifyPassword(password);

  requestETHRpc = (data: { method: string; params: any }, chainId: string) => {
    return providerController.ethRpc(
      {
        data,
        session: {
          name: 'Rabby',
          origin: INTERNAL_REQUEST_ORIGIN,
          icon: './images/icon-128.png',
        },
      },
      chainId
    );
  };

  sendRequest = (data) => {
    return provider({
      data,
      session: {
        name: 'Rabby',
        origin: INTERNAL_REQUEST_ORIGIN,
        icon: './images/icon-128.png',
      },
    });
  };

  getApproval = notificationService.getApproval;
  resolveApproval = notificationService.resolveApproval;
  rejectApproval = notificationService.rejectApproval;

  approveToken = async (
    chainServerId: string,
    id: string,
    spender: string,
    amount: number
  ) => {
    const account = await preferenceService.getCurrentAccount();
    if (!account) throw new Error('no current account');
    const chainId = Object.values(CHAINS)
      .find((chain) => chain.serverId === chainServerId)
      ?.id.toString();
    if (!chainId) throw new Error('invalid chain id');
    buildinProvider.currentProvider.currentAccount = account.address;
    buildinProvider.currentProvider.currentAccountType = account.type;
    buildinProvider.currentProvider.currentAccountBrand = account.brandName;
    buildinProvider.currentProvider.chainId = chainId;
    const provider = new ethers.providers.Web3Provider(
      buildinProvider.currentProvider
    );
    const signer = provider.getSigner();
    const contract = new Contract(id, ERC20ABI, signer);
    await contract.approve(spender, amount);
  };

  transferNFT = async ({
    to,
    chainServerId,
    contractId,
    abi,
    tokenId,
    amount,
  }: {
    to: string;
    chainServerId: string;
    contractId: string;
    abi: 'ERC721' | 'ERC1155';
    tokenId: string;
    amount?: number;
  }) => {
    const account = await preferenceService.getCurrentAccount();
    if (!account) throw new Error('no current account');
    const chainId = Object.values(CHAINS)
      .find((chain) => chain.serverId === chainServerId)
      ?.id.toString();
    if (!chainId) throw new Error('invalid chain id');
    buildinProvider.currentProvider.currentAccount = account.address;
    buildinProvider.currentProvider.currentAccountType = account.type;
    buildinProvider.currentProvider.currentAccountBrand = account.brandName;
    buildinProvider.currentProvider.chainId = chainId;
    const provider = new ethers.providers.Web3Provider(
      buildinProvider.currentProvider
    );
    const signer = provider.getSigner();
    if (abi === 'ERC721') {
      const contract = new Contract(contractId, ERC721ABI, signer);
      await contract['safeTransferFrom(address,address,uint256)'](
        account.address,
        to,
        tokenId
      );
    } else if (abi === 'ERC1155') {
      const contract = new Contract(contractId, ERC1155ABI, signer);
      await contract.safeTransferFrom(account.address, to, tokenId, amount, []);
    } else {
      throw new Error('unknown contract abi');
    }
  };

  revokeNFTApprove = async ({
    chainServerId,
    contractId,
    spender,
    abi,
    tokenId,
    isApprovedForAll,
  }: {
    chainServerId: string;
    contractId: string;
    spender: string;
    abi: 'ERC721' | 'ERC1155';
    isApprovedForAll: boolean;
    tokenId: string | null | undefined;
  }) => {
    const account = await preferenceService.getCurrentAccount();
    if (!account) throw new Error('no current account');
    const chainId = Object.values(CHAINS)
      .find((chain) => chain.serverId === chainServerId)
      ?.id.toString();
    if (!chainId) throw new Error('invalid chain id');
    buildinProvider.currentProvider.currentAccount = account.address;
    buildinProvider.currentProvider.currentAccountType = account.type;
    buildinProvider.currentProvider.currentAccountBrand = account.brandName;
    buildinProvider.currentProvider.chainId = chainId;
    const provider = new ethers.providers.Web3Provider(
      buildinProvider.currentProvider
    );
    const signer = provider.getSigner();
    if (abi === 'ERC721') {
      const contract = new Contract(contractId, ERC721ABI, signer);
      if (isApprovedForAll) {
        await contract.setApprovalForAll(spender, false);
      } else {
        await contract.approve(
          '0x0000000000000000000000000000000000000000',
          tokenId
        );
      }
    } else if (abi === 'ERC1155') {
      const contract = new Contract(contractId, ERC1155ABI, signer);
      await contract.setApprovalForAll(spender, false);
    } else {
      throw new Error('unknown contract abi');
    }
  };

  initAlianNames = async () => {
    await preferenceService.changeInitAlianNameStatus();
    const contacts = await this.listContact();
    const keyrings = await keyringService.getAllTypedAccounts();
    const walletConnectKeyrings = keyrings.filter(
      (item) => item.type === 'WalletConnect'
    );
    const catergoryGroupAccount = keyrings.map((item) => ({
      type: item.type,
      accounts: item.accounts,
    }));
    let walletConnectList: DisplayedKeryring['accounts'] = [];
    for (let i = 0; i < walletConnectKeyrings.length; i++) {
      const keyring = walletConnectKeyrings[i];
      walletConnectList = [...walletConnectList, ...keyring.accounts];
    }
    const groupedWalletConnectList = groupBy(walletConnectList, 'brandName');
    if (keyrings.length > 0) {
      Object.keys(groupedWalletConnectList).forEach((key) => {
        groupedWalletConnectList[key].map((acc, index) => {
          if (
            contacts.find((contact) =>
              isSameAddress(contact.address, acc.address)
            )
          ) {
            return;
          }
          this.updateAlianName(
            acc?.address,
            `${WALLET_BRAND_CONTENT[acc?.brandName]} ${index + 1}`
          );
        });
      });
      const catergories = groupBy(
        catergoryGroupAccount.filter((group) => group.type !== 'WalletConnect'),
        'type'
      );
      const result = Object.keys(catergories)
        .map((key) =>
          catergories[key].map((item) =>
            item.accounts.map((acc) => ({
              address: acc.address,
              type: key,
            }))
          )
        )
        .map((item) => item.flat(1));
      result.forEach((group) =>
        group.forEach((acc, index) => {
          this.updateAlianName(
            acc?.address,
            `${BRAND_ALIAN_TYPE_TEXT[acc?.type]} ${index + 1}`
          );
        })
      );
    }
    if (contacts.length !== 0 && keyrings.length !== 0) {
      const allAccounts = keyrings.map((item) => item.accounts).flat();
      const sameAddressList = contacts.filter((item) =>
        allAccounts.find((contact) =>
          isSameAddress(contact.address, item.address)
        )
      );
      if (sameAddressList.length > 0) {
        sameAddressList.forEach((item) =>
          this.updateAlianName(item.address, item.name)
        );
      }
    }
  };

  unlock = async (password: string) => {
    const alianNameInited = await preferenceService.getInitAlianNameStatus();
    const alianNames = await preferenceService.getAllAlianName();
    await keyringService.submitPassword(password);
    sessionService.broadcastEvent('unlock');
    if (!alianNameInited && Object.values(alianNames).length === 0) {
      this.initAlianNames();
    }
  };
  isUnlocked = () => keyringService.memStore.getState().isUnlocked;

  lockWallet = async () => {
    await keyringService.setLocked();
    sessionService.broadcastEvent('accountsChanged', []);
    sessionService.broadcastEvent('lock');
  };
  setPopupOpen = (isOpen) => {
    preferenceService.setPopupOpen(isOpen);
  };
  openIndexPage = openIndexPage;

  hasPageStateCache = () => pageStateCacheService.has();
  getPageStateCache = () => {
    if (!this.isUnlocked()) return null;
    return pageStateCacheService.get();
  };
  clearPageStateCache = () => pageStateCacheService.clear();
  setPageStateCache = (cache: CacheState) => pageStateCacheService.set(cache);

  getIndexByAddress = (address: string, type: string) => {
    const hasIndex = KEYRING_WITH_INDEX.includes(type);
    if (!hasIndex) return null;
    const keyring = keyringService.getKeyringByType(type);
    if (!keyring) return null;
    switch (type) {
      case KEYRING_CLASS.HARDWARE.LEDGER: {
        return keyring.getIndexFromAddress(address);
      }
      case KEYRING_CLASS.HARDWARE.GRIDPLUS: {
        const accountIndices = keyring.accountIndices;
        const accounts = keyring.accounts;
        const index = accounts.findIndex(
          (account) => account.toLowerCase() === address.toLowerCase()
        );
        if (index === -1) return null;
        if (accountIndices.length - 1 < index) return null;
        return accountIndices[index];
      }
      default:
        return null;
    }
  };

  getAddressBalance = async (address: string) => {
    const data = await openapiService.getTotalBalance(address);
    preferenceService.updateAddressBalance(address, data);
    return data;
  };
  getAddressCacheBalance = (address: string | undefined) => {
    if (!address) return null;
    return preferenceService.getAddressBalance(address);
  };

  setHasOtherProvider = (val: boolean) =>
    preferenceService.setHasOtherProvider(val);
  getHasOtherProvider = () => preferenceService.getHasOtherProvider();

  getExternalLinkAck = () => preferenceService.getExternalLinkAck();

  setExternalLinkAck = (ack) => preferenceService.setExternalLinkAck(ack);

  getLocale = () => preferenceService.getLocale();
  setLocale = (locale: string) => preferenceService.setLocale(locale);

  getLastTimeSendToken = (address: string) =>
    preferenceService.getLastTimeSendToken(address);
  setLastTimeSendToken = (address: string, token: TokenItem) =>
    preferenceService.setLastTimeSendToken(address, token);

  getTokenApprovalChain = (address: string) =>
    preferenceService.getTokenApprovalChain(address);

  setTokenApprovalChain = (address: string, chain: CHAINS_ENUM) => {
    preferenceService.setTokenApprovalChain(address, chain);
  };

  getNFTApprovalChain = (address: string) =>
    preferenceService.getNFTApprovalChain(address);

  setNFTApprovalChain = (address: string, chain: CHAINS_ENUM) => {
    preferenceService.setNFTApprovalChain(address, chain);
  };

  /* chains */
  getSavedChains = () => preferenceService.getSavedChains();
  saveChain = (id: string) => preferenceService.saveChain(id);
  updateChain = (list: string[]) => preferenceService.updateChain(list);
  /* connectedSites */

  getConnectedSite = permissionService.getConnectedSite;
  getConnectedSites = permissionService.getConnectedSites;
  setRecentConnectedSites = (sites: ConnectedSite[]) => {
    permissionService.setRecentConnectedSites(sites);
  };
  getRecentConnectedSites = () => {
    return permissionService.getRecentConnectedSites();
  };
  getCurrentConnectedSite = (tabId: number) => {
    const { origin } = sessionService.getSession(tabId) || {};
    return permissionService.getWithoutUpdate(origin);
  };
  updateConnectSite = (origin: string, data: ConnectedSite) => {
    permissionService.updateConnectSite(origin, data);
    sessionService.broadcastEvent(
      'chainChanged',
      {
        chain: CHAINS[data.chain].hex,
        networkVersion: CHAINS[data.chain].network,
      },
      data.origin
    );
  };
  removeAllRecentConnectedSites = () => {
    const sites = permissionService
      .getRecentConnectedSites()
      .filter((item) => !item.isTop);
    sites.forEach((item) => {
      this.removeConnectedSite(item.origin);
    });
  };
  removeConnectedSite = (origin: string) => {
    sessionService.broadcastEvent('accountsChanged', [], origin);
    permissionService.removeConnectedSite(origin);
  };
  getSitesByDefaultChain = permissionService.getSitesByDefaultChain;
  topConnectedSite = (origin: string) =>
    permissionService.topConnectedSite(origin);
  unpinConnectedSite = (origin: string) =>
    permissionService.unpinConnectedSite(origin);
  /* keyrings */

  clearKeyrings = () => keyringService.clearKeyrings();

  importGnosisAddress = async (address: string, networkId: string) => {
    let keyring, isNewKey;
    const keyringType = KEYRING_CLASS.GNOSIS;
    try {
      keyring = this._getKeyringByType(keyringType);
    } catch {
      const GnosisKeyring = keyringService.getKeyringClassForType(keyringType);
      keyring = new GnosisKeyring({});
      isNewKey = true;
    }

    keyring.setAccountToAdd(address);
    keyring.setNetworkId(address, networkId);
    await keyringService.addNewAccount(keyring);
    if (isNewKey) {
      await keyringService.addKeyring(keyring);
    }
    (keyring as GnosisKeyring).on(TransactionBuiltEvent, (data) => {
      eventBus.emit(EVENTS.broadcastToUI, {
        method: TransactionBuiltEvent,
        params: data,
      });
      (keyring as GnosisKeyring).on(TransactionConfirmedEvent, (data) => {
        eventBus.emit(EVENTS.broadcastToUI, {
          method: TransactionConfirmedEvent,
          params: data,
        });
      });
    });
    return this._setCurrentAccountFromKeyring(keyring, -1);
  };

  clearGnosisTransaction = () => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    if (keyring.currentTransaction || keyring.safeInstance) {
      keyring.currentTransaction = null;
      keyring.safeInstance = null;
    }
  };

  getGnosisNetworkId = (address: string) => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    const networkId = keyring.networkIdMap[address.toLowerCase()];
    if (networkId === undefined) {
      throw new Error(`Address ${address} is not in keyring"`);
    }
    return networkId;
  };

  getGnosisTransactionHash = () => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    if (keyring.currentTransaction) {
      return keyring.getTransactionHash();
    }
    return null;
  };

  getGnosisTransactionSignatures = () => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    if (keyring.currentTransaction) {
      const sigs = Array.from(keyring.currentTransaction.signatures.values());
      return sigs.map((sig) => ({ data: sig.data, signer: sig.signer }));
    }
    return [];
  };

  setGnosisTransactionHash = (hash: string) => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    keyring.currentTransactionHash = hash;
  };

  buildGnosisTransaction = async (
    safeAddress: string,
    account: Account,
    tx
  ) => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    if (keyring) {
      buildinProvider.currentProvider.currentAccount = account.address;
      buildinProvider.currentProvider.currentAccountType = account.type;
      buildinProvider.currentProvider.currentAccountBrand = account.brandName;
      await keyring.buildTransaction(
        safeAddress,
        tx,
        new ethers.providers.Web3Provider(buildinProvider.currentProvider)
      );
    } else {
      throw new Error('No Gnosis keyring found');
    }
  };

  postGnosisTransaction = () => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    if (!keyring || !keyring.currentTransaction) {
      throw new Error('No transaction in Gnosis keyring found');
    }
    return keyring.postTransaction();
  };

  getGnosisOwners = (
    account: Account,
    safeAddress: string,
    version: string
  ) => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    if (!keyring) throw new Error('No Gnosis keyring found');
    buildinProvider.currentProvider.currentAccount = account.address;
    buildinProvider.currentProvider.currentAccountType = account.type;
    buildinProvider.currentProvider.currentAccountBrand = account.brandName;
    return keyring.getOwners(
      safeAddress,
      version,
      new ethers.providers.Web3Provider(buildinProvider.currentProvider)
    );
  };

  signGnosisTransaction = (account: Account) => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    if (keyring.currentTransaction && keyring.safeInstance) {
      buildinProvider.currentProvider.currentAccount = account.address;
      buildinProvider.currentProvider.currentAccountType = account.type;
      buildinProvider.currentProvider.currentAccountBrand = account.brandName;
      return keyring.confirmTransaction({
        safeAddress: keyring.safeInstance.safeAddress,
        transaction: keyring.currentTransaction,
        networkId: keyring.safeInstance.network,
        provider: new ethers.providers.Web3Provider(
          buildinProvider.currentProvider
        ),
      });
    }
  };

  checkGnosisTransactionCanExec = async () => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    if (keyring.currentTransaction && keyring.safeInstance) {
      const threshold = await keyring.safeInstance.getThreshold();
      return keyring.currentTransaction.signatures.size >= threshold;
    }
    return false;
  };

  execGnosisTransaction = async (account: Account) => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    if (keyring.currentTransaction && keyring.safeInstance) {
      buildinProvider.currentProvider.currentAccount = account.address;
      buildinProvider.currentProvider.currentAccountType = account.type;
      buildinProvider.currentProvider.currentAccountBrand = account.brandName;
      await keyring.execTransaction({
        safeAddress: keyring.safeInstance.safeAddress,
        transaction: keyring.currentTransaction,
        networkId: keyring.safeInstance.network,
        provider: new ethers.providers.Web3Provider(
          buildinProvider.currentProvider
        ),
      });
    }
  };

  gnosisAddConfirmation = async (address: string, signature: string) => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    if (!keyring) throw new Error('No Gnosis keyring found');
    if (!keyring.currentTransaction) {
      throw new Error('No transaction in Gnosis keyring');
    }
    await keyring.addConfirmation(address, signature);
  };

  gnosisAddPureSignature = async (address: string, signature: string) => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    if (!keyring) throw new Error('No Gnosis keyring found');
    if (!keyring.currentTransaction) {
      throw new Error('No transaction in Gnosis keyring');
    }
    await keyring.addPureSignature(address, signature);
  };

  gnosisAddSignature = async (address: string, signature: string) => {
    const keyring: GnosisKeyring = this._getKeyringByType(KEYRING_CLASS.GNOSIS);
    if (!keyring) throw new Error('No Gnosis keyring found');
    if (!keyring.currentTransaction) {
      throw new Error('No transaction in Gnosis keyring');
    }
    await keyring.addSignature(address, signature);
  };

  importWatchAddress = async (address) => {
    let keyring, isNewKey;
    const keyringType = KEYRING_CLASS.WATCH;
    try {
      keyring = this._getKeyringByType(keyringType);
    } catch {
      const WatchKeyring = keyringService.getKeyringClassForType(keyringType);
      keyring = new WatchKeyring();
      isNewKey = true;
    }

    keyring.setAccountToAdd(address);
    await keyringService.addNewAccount(keyring);
    if (isNewKey) {
      await keyringService.addKeyring(keyring);
    }
    return this._setCurrentAccountFromKeyring(keyring, -1);
  };

  getWalletConnectStatus = (address: string, brandName: string) => {
    const keyringType = KEYRING_CLASS.WALLETCONNECT;
    const keyring: WalletConnectKeyring = this._getKeyringByType(keyringType);
    if (keyring) {
      return keyring.getConnectorStatus(address, brandName);
    }
    return null;
  };

  initWalletConnect = async (brandName: string, bridge?: string) => {
    let keyring: WalletConnectKeyring, isNewKey;
    const keyringType = KEYRING_CLASS.WALLETCONNECT;
    try {
      keyring = this._getKeyringByType(keyringType);
    } catch {
      const WalletConnect = keyringService.getKeyringClassForType(keyringType);
      keyring = new WalletConnect({
        accounts: [],
        brandName: brandName,
        clientMeta: {
          description: i18n.t('appDescription'),
          url: 'https://rabby.io',
          icons: ['https://rabby.io/assets/images/logo.png'],
          name: 'Rabby',
        },
      });
      isNewKey = true;
    }
    const { uri } = await keyring.initConnector(brandName, bridge);
    let stashId: null | number = null;
    if (isNewKey) {
      stashId = this.addKyeringToStash(keyring);
      eventBus.addEventListener(
        EVENTS.WALLETCONNECT.INIT,
        ({ address, brandName }) => {
          (keyring as WalletConnectKeyring).init(address, brandName);
        }
      );
      (keyring as WalletConnectKeyring).on('inited', (uri) => {
        eventBus.emit(EVENTS.broadcastToUI, {
          method: EVENTS.WALLETCONNECT.INITED,
          params: { uri },
        });
      });
      keyring.on('statusChange', (data) => {
        eventBus.emit(EVENTS.broadcastToUI, {
          method: EVENTS.WALLETCONNECT.STATUS_CHANGED,
          params: data,
        });
        if (!preferenceService.getPopupOpen()) {
          setPageStateCacheWhenPopupClose(data);
        }
      });
    }
    return {
      uri,
      stashId,
    };
  };

  getWalletConnectBridge = (address: string, brandName: string) => {
    const keyringType = KEYRING_CLASS.WALLETCONNECT;
    const keyring: WalletConnectKeyring = this._getKeyringByType(keyringType);
    if (keyring) {
      const target = keyring.accounts.find(
        (account) =>
          account.address.toLowerCase() === address.toLowerCase() &&
          brandName === account.brandName
      );

      if (target) return target.bridge;

      return null;
    }
    return null;
  };

  getWalletConnectConnectors = () => {
    const keyringType = KEYRING_CLASS.WALLETCONNECT;
    const keyring: WalletConnectKeyring = this._getKeyringByType(keyringType);
    if (keyring) {
      const result: { address: string; brandName: string }[] = [];
      for (const key in keyring.connectors) {
        const target = keyring.connectors[key];
        result.push({
          address: key.split('-')[1],
          brandName: target.brandName,
        });
      }
      return result;
    }
    return [];
  };

  killWalletConnectConnector = async (address: string, brandName: string) => {
    const keyringType = KEYRING_CLASS.WALLETCONNECT;
    const keyring: WalletConnectKeyring = this._getKeyringByType(keyringType);
    if (keyring) {
      const connector =
        keyring.connectors[`${brandName}-${address.toLowerCase()}`];
      if (connector) {
        await keyring.closeConnector(connector.connector, address, brandName);
      }
    }
  };

  importWalletConnect = async (
    address: string,
    brandName: string,
    bridge?: string,
    stashId?: number
  ) => {
    let keyring: WalletConnectKeyring, isNewKey;
    const keyringType = KEYRING_CLASS.WALLETCONNECT;
    if (stashId !== null && stashId !== undefined) {
      keyring = stashKeyrings[stashId];
      isNewKey = true;
    } else {
      try {
        keyring = this._getKeyringByType(keyringType);
      } catch {
        const WalletConnectKeyring = keyringService.getKeyringClassForType(
          keyringType
        );
        keyring = new WalletConnectKeyring();
        isNewKey = true;
      }
    }

    keyring.setAccountToAdd({
      address,
      brandName,
      bridge,
    });

    if (isNewKey) {
      await keyringService.addKeyring(keyring);
    }

    await keyringService.addNewAccount(keyring);
    this.clearPageStateCache();
    return this._setCurrentAccountFromKeyring(keyring, -1);
  };

  getPrivateKey = async (
    password: string,
    { address, type }: { address: string; type: string }
  ) => {
    await this.verifyPassword(password);
    const keyring = await keyringService.getKeyringForAccount(address, type);
    if (!keyring) return null;
    return await keyring.exportAccount(address);
  };

  getMnemonics = async (password: string) => {
    await this.verifyPassword(password);
    const keyring = this._getKeyringByType(KEYRING_CLASS.MNEMONIC);
    const serialized = await keyring.serialize();
    const seedWords = serialized.mnemonic;

    return seedWords;
  };

  clearAddressPendingTransactions = (address: string) => {
    return transactionHistoryService.clearPendingTransactions(address);
  };

  importPrivateKey = async (data) => {
    const privateKey = ethUtil.stripHexPrefix(data);
    const buffer = Buffer.from(privateKey, 'hex');

    const error = new Error(i18n.t('the private key is invalid'));
    try {
      if (!ethUtil.isValidPrivate(buffer)) {
        throw error;
      }
    } catch {
      throw error;
    }

    const keyring = await keyringService.importPrivateKey(privateKey);
    return this._setCurrentAccountFromKeyring(keyring);
  };

  // json format is from "https://github.com/SilentCicero/ethereumjs-accounts"
  // or "https://github.com/ethereum/wiki/wiki/Web3-Secret-Storage-Definition"
  // for example: https://www.myetherwallet.com/create-wallet
  importJson = async (content: string, password: string) => {
    try {
      JSON.parse(content);
    } catch {
      throw new Error(i18n.t('the input file is invalid'));
    }

    let wallet;
    try {
      wallet = thirdparty.fromEtherWallet(content, password);
    } catch (e) {
      wallet = await Wallet.fromV3(content, password, true);
    }

    const privateKey = wallet.getPrivateKeyString();
    const keyring = await keyringService.importPrivateKey(
      ethUtil.stripHexPrefix(privateKey)
    );
    return this._setCurrentAccountFromKeyring(keyring);
  };

  getPreMnemonics = () => keyringService.getPreMnemonics();
  generatePreMnemonic = () => keyringService.generatePreMnemonic();
  removePreMnemonics = () => keyringService.removePreMnemonics();
  createKeyringWithMnemonics = async (mnemonic) => {
    const keyring = await keyringService.createKeyringWithMnemonics(mnemonic);
    keyringService.removePreMnemonics();
    return this._setCurrentAccountFromKeyring(keyring);
  };

  getHiddenAddresses = () => preferenceService.getHiddenAddresses();
  showAddress = (type: string, address: string) =>
    preferenceService.showAddress(type, address);
  hideAddress = (type: string, address: string, brandName: string) => {
    preferenceService.hideAddress(type, address, brandName);
    const current = preferenceService.getCurrentAccount();
    if (current?.address === address && current.type === type) {
      this.resetCurrentAccount();
    }
  };

  removeAddress = async (address: string, type: string, brand?: string) => {
    await keyringService.removeAccount(address, type, brand);
    if (!(await keyringService.hasAddress(address))) {
      preferenceService.removeAlianName(address);
    }
    preferenceService.removeAddressBalance(address);
    const current = preferenceService.getCurrentAccount();
    if (
      current?.address === address &&
      current.type === type &&
      current.brandName === brand
    ) {
      this.resetCurrentAccount();
    }
  };

  resetCurrentAccount = async () => {
    const [account] = await this.getAccounts();
    if (account) {
      preferenceService.setCurrentAccount(account);
    } else {
      preferenceService.setCurrentAccount(null);
    }
  };

  generateKeyringWithMnemonic = (mnemonic) => {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error(i18n.t('mnemonic phrase is invalid'));
    }

    const Keyring = keyringService.getKeyringClassForType(
      KEYRING_CLASS.MNEMONIC
    );

    const keyring = new Keyring({ mnemonic });

    const stashId = Object.values(stashKeyrings).length;
    stashKeyrings[stashId] = keyring;

    return stashId;
  };

  addKyeringToStash = (keyring) => {
    const stashId = Object.values(stashKeyrings).length;
    stashKeyrings[stashId] = keyring;

    return stashId;
  };

  addKeyring = async (keyringId) => {
    const keyring = stashKeyrings[keyringId];
    if (keyring) {
      await keyringService.addKeyring(keyring);
      this._setCurrentAccountFromKeyring(keyring);
    } else {
      throw new Error('failed to addKeyring, keyring is undefined');
    }
  };

  getKeyringByType = (type: string) => keyringService.getKeyringByType(type);

  checkHasMnemonic = () => {
    try {
      const keyring = this._getKeyringByType(KEYRING_CLASS.MNEMONIC);
      return !!keyring.mnemonic;
    } catch (e) {
      return false;
    }
  };

  deriveNewAccountFromMnemonic = async () => {
    const keyring = this._getKeyringByType(KEYRING_CLASS.MNEMONIC);

    const result = await keyringService.addNewAccount(keyring);
    this._setCurrentAccountFromKeyring(keyring, -1);
    return result;
  };

  getAccountsCount = async () => {
    const accounts = await keyringService.getAccounts();
    return accounts.filter((x) => x).length;
  };

  getTypedAccounts = async (type) => {
    return Promise.all(
      keyringService.keyrings
        .filter((keyring) => !type || keyring.type === type)
        .map((keyring) => keyringService.displayForKeyring(keyring))
    );
  };

  getAllVisibleAccounts: () => Promise<DisplayedKeryring[]> = async () => {
    const typedAccounts = await keyringService.getAllTypedVisibleAccounts();

    return typedAccounts.map((account) => ({
      ...account,
      keyring: new DisplayKeyring(account.keyring),
    }));
  };

  getAllVisibleAccountsArray: () => Promise<Account[]> = () => {
    return keyringService.getAllVisibleAccountsArray();
  };

  getAllClassAccounts: () => Promise<DisplayedKeryring[]> = async () => {
    const typedAccounts = await keyringService.getAllTypedAccounts();

    return typedAccounts.map((account) => ({
      ...account,
      keyring: new DisplayKeyring(account.keyring),
    }));
  };

  changeAccount = (account: Account) => {
    preferenceService.setCurrentAccount(account);
  };

  isUseLedgerLive = () => {
    const keyring = keyringService.getKeyringByType(
      KEYRING_CLASS.HARDWARE.LEDGER
    );
    if (!keyring) return false;
    return !keyring.isWebHID;
  };

  updateUseLedgerLive = async (value: boolean) =>
    preferenceService.updateUseLedgerLive(value);

  connectHardware = async ({
    type,
    hdPath,
    needUnlock = false,
    isWebHID = false,
  }: {
    type: string;
    hdPath?: string;
    needUnlock?: boolean;
    isWebHID?: boolean;
  }) => {
    let keyring;
    let stashKeyringId: number | null = null;
    try {
      keyring = this._getKeyringByType(type);
    } catch {
      const Keyring = keyringService.getKeyringClassForType(type);
      keyring = new Keyring();
      stashKeyringId = Object.values(stashKeyrings).length;
      stashKeyrings[stashKeyringId] = keyring;
    }

    if (hdPath && keyring.setHdPath) {
      keyring.setHdPath(hdPath);
    }

    if (needUnlock) {
      await keyring.unlock();
    }

    if (keyring.useWebHID) {
      keyring.useWebHID(isWebHID);
    }

    if (
      type === KEYRING_CLASS.HARDWARE.LEDGER &&
      !isWebHID &&
      stashKeyringId !== null
    ) {
      keyring.updateTransportMethod &&
        (await keyring.updateTransportMethod(true));
    }

    return stashKeyringId;
  };

  acquireKeystoneMemStoreData = async () => {
    const keyringType = KEYRING_CLASS.QRCODE;
    const keyring: KeystoneKeyring = this._getKeyringByType(keyringType);
    if (keyring) {
      keyring.getInteraction().on(MemStoreDataReady, (request) => {
        eventBus.emit(EVENTS.broadcastToUI, {
          method: EVENTS.QRHARDWARE.ACQUIRE_MEMSTORE_SUCCEED,
          params: {
            request,
          },
        });
      });
      keyring.getInteraction().emit(AcquireMemeStoreData);
    }
  };

  submitQRHardwareCryptoHDKey = async (cbor: string) => {
    let keyring;
    let stashKeyringId: number | null = null;
    const keyringType = KEYRING_CLASS.QRCODE;
    try {
      keyring = this._getKeyringByType(keyringType);
    } catch {
      const keystoneKeyring = keyringService.getKeyringClassForType(
        keyringType
      );
      keyring = new keystoneKeyring();
      stashKeyringId = Object.values(stashKeyrings).length;
      stashKeyrings[stashKeyringId] = keyring;
    }
    keyring.readKeyring();
    await keyring.submitCryptoHDKey(cbor);
    return stashKeyringId;
  };

  submitQRHardwareCryptoAccount = async (cbor: string) => {
    let keyring;
    let stashKeyringId: number | null = null;
    const keyringType = KEYRING_CLASS.QRCODE;
    try {
      keyring = this._getKeyringByType(keyringType);
    } catch {
      const keystoneKeyring = keyringService.getKeyringClassForType(
        keyringType
      );
      keyring = new keystoneKeyring();
      stashKeyringId = Object.values(stashKeyrings).length;
      stashKeyrings[stashKeyringId] = keyring;
    }
    keyring.readKeyring();
    await keyring.submitCryptoAccount(cbor);
    return stashKeyringId;
  };

  submitQRHardwareSignature = async (requestId: string, cbor: string) => {
    const account = await preferenceService.getCurrentAccount();
    const keyring = await keyringService.getKeyringForAccount(
      account!.address,
      KEYRING_CLASS.QRCODE
    );
    return await keyring.submitSignature(requestId, cbor);
  };

  signPersonalMessage = async (
    type: string,
    from: string,
    data: string,
    options?: any
  ) => {
    const keyring = await keyringService.getKeyringForAccount(from, type);
    const res = await keyringService.signPersonalMessage(
      keyring,
      { from, data },
      options
    );
    eventBus.emit(EVENTS.broadcastToUI, {
      method: EVENTS.SIGN_FINISHED,
      params: {
        success: true,
        data: res,
      },
    });
    return res;
  };

  signTransaction = async (
    type: string,
    from: string,
    data: any,
    options?: any
  ) => {
    const keyring = await keyringService.getKeyringForAccount(from, type);
    return keyringService.signTransaction(keyring, data, from, options);
  };

  requestKeyring = (type, methodName, keyringId: number | null, ...params) => {
    let keyring;
    if (keyringId !== null && keyringId !== undefined) {
      keyring = stashKeyrings[keyringId];
    } else {
      try {
        keyring = this._getKeyringByType(type);
      } catch {
        const Keyring = keyringService.getKeyringClassForType(type);
        keyring = new Keyring();
      }
    }
    if (keyring[methodName]) {
      return keyring[methodName].call(keyring, ...params);
    }
  };

  unlockHardwareAccount = async (keyring, indexes, keyringId) => {
    let keyringInstance: any = null;
    try {
      keyringInstance = this._getKeyringByType(keyring);
    } catch (e) {
      // NOTHING
    }
    if (!keyringInstance && keyringId !== null && keyringId !== undefined) {
      await keyringService.addKeyring(stashKeyrings[keyringId]);
      keyringInstance = stashKeyrings[keyringId];
    }
    for (let i = 0; i < indexes.length; i++) {
      keyringInstance!.setAccountToUnlock(indexes[i]);
      await keyringService.addNewAccount(keyringInstance);
    }

    return this._setCurrentAccountFromKeyring(keyringInstance);
  };

  getSignTextHistory = (address: string) => {
    return signTextHistoryService.getHistory(address);
  };

  addTxExplainCache = (params: {
    address: string;
    chainId: number;
    nonce: number;
    explain: ExplainTxResponse;
  }) => transactionHistoryService.addExplainCache(params);
  getTransactionHistory = (address: string) =>
    transactionHistoryService.getList(address);
  comepleteTransaction = (params: {
    address: string;
    chainId: number;
    nonce: number;
    hash: string;
    success?: boolean;
    gasUsed?: number;
  }) => transactionHistoryService.completeTx(params);
  getPendingCount = (address: string) =>
    transactionHistoryService.getPendingCount(address);
  getNonceByChain = (address: string, chainId: number) =>
    transactionHistoryService.getNonceByChain(address, chainId);

  setIsDefaultWallet = (val: boolean) =>
    preferenceService.setIsDefaultWallet(val);
  isDefaultWallet = () => preferenceService.getIsDefaultWallet();

  private _getKeyringByType(type) {
    const keyring = keyringService.getKeyringsByType(type)[0];

    if (keyring) {
      return keyring;
    }

    throw ethErrors.rpc.internal(`No ${type} keyring found`);
  }

  addContact = (data: ContactBookItem) => {
    contactBookService.addContact(data);
  };
  updateContact = (data: ContactBookItem) => {
    contactBookService.updateContact(data);
  };
  removeContact = (address: string) => {
    contactBookService.removeContact(address);
  };
  listContact = () => contactBookService.listContacts();
  getContactByAddress = (address: string) =>
    contactBookService.getContactByAddress(address);

  private async _setCurrentAccountFromKeyring(keyring, index = 0) {
    const accounts = keyring.getAccountsWithBrand
      ? await keyring.getAccountsWithBrand()
      : await keyring.getAccounts();
    const account = accounts[index < 0 ? index + accounts.length : index];

    if (!account) {
      throw new Error('the current account is empty');
    }

    const _account = {
      address: typeof account === 'string' ? account : account.address,
      type: keyring.type,
      brandName: typeof account === 'string' ? keyring.type : account.brandName,
    };
    preferenceService.setCurrentAccount(_account);

    return [_account];
  }

  getHighlightWalletList = () => {
    return preferenceService.getWalletSavedList();
  };

  updateHighlightWalletList = (list) => {
    return preferenceService.updateWalletSavedList(list);
  };

  getAlianName = (address: string) => preferenceService.getAlianName(address);
  updateAlianName = (address: string, name: string) =>
    preferenceService.updateAlianName(address, name);
  getAllAlianName = () => preferenceService.getAllAlianName();
  getInitAlianNameStatus = () => preferenceService.getInitAlianNameStatus();
  updateInitAlianNameStatus = () =>
    preferenceService.changeInitAlianNameStatus();
  getLastTimeGasSelection = (chainId) => {
    return preferenceService.getLastTimeGasSelection(chainId);
  };

  updateLastTimeGasSelection = (chainId: string, gas: ChainGas) => {
    return preferenceService.updateLastTimeGasSelection(chainId, gas);
  };
  getIsFirstOpen = () => {
    return preferenceService.getIsFirstOpen();
  };
  updateIsFirstOpen = () => {
    return preferenceService.updateIsFirstOpen();
  };
  listChainAssets = async (address: string) => {
    return await openapiService.listChainAssets(address);
  };
  getAddedToken = (address: string) => {
    return preferenceService.getAddedToken(address);
  };
  updateAddedToken = (address: string, tokenList: []) => {
    return preferenceService.updateAddedToken(address, tokenList);
  };
  getWidgets = () => {
    return widgetService.getWidgets();
  };
  enableWidget = (name: string) => {
    widgetService.enableWidget(name);
  };
  disableWidget = (name: string) => {
    widgetService.disableWidget(name);
  };

  reportStats = (name: string, params: Record<string, string | number>) => {
    stats.report(name, params);
  };
}

export default new WalletController();
