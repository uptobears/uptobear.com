// Wallet: EIP-1193 connect, chain switch, ethers v6 contracts.
// Reads go through a plain RPC provider (works whatever chain the wallet is on); writes through the wallet.

const wallet = {
  address: null,
  signer: null,
  browser: null,
  rpc: null,
  onChange: null,
};

function rpcProvider() {
  if (!wallet.rpc) wallet.rpc = new ethers.JsonRpcProvider(CONFIG.RPC_URL, CONFIG.CHAIN_ID, { staticNetwork: true });
  return wallet.rpc;
}
function readContract(addr, abi) {
  return new ethers.Contract(addr, abi, rpcProvider());
}
function writeContract(addr, abi) {
  if (!wallet.signer) throw new Error("Connect a wallet first.");
  return new ethers.Contract(addr, abi, wallet.signer);
}

async function currentChainHex() {
  return window.ethereum.request({ method: "eth_chainId" });
}
function onRightChain(hex) {
  return typeof hex === "string" && parseInt(hex, 16) === CONFIG.CHAIN_ID;
}

async function switchChain() {
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CONFIG.CHAIN_HEX }] });
  } catch (e) {
    if (e && (e.code === 4902 || /unrecognized|not added|4902/i.test(e.message || ""))) {
      const p = {
        chainId: CONFIG.CHAIN_HEX,
        chainName: CONFIG.CHAIN_NAME,
        rpcUrls: [CONFIG.RPC_URL],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      };
      if (CONFIG.EXPLORER_URL) p.blockExplorerUrls = [CONFIG.EXPLORER_URL];
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [p] });
    } else {
      throw e;
    }
  }
}

// Wires #connect, #switch, #wallet-line, #wallet-err. Calls wallet.onChange() after connect/chain/account changes.
async function connectWallet() {
  const err = "wallet-err";
  showError(err, null);
  try {
    if (!window.ethereum) throw new Error("No wallet found. Install a browser wallet and reload.");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    wallet.address = ethers.getAddress(accounts[0]);
    await refreshChain();
    if (!window.ethereum._uptobearsWired) {
      window.ethereum._uptobearsWired = true;
      window.ethereum.on?.("chainChanged", () => refreshChain().catch((e) => showError(err, e)));
      window.ethereum.on?.("accountsChanged", (a) => {
        wallet.address = a && a[0] ? ethers.getAddress(a[0]) : null;
        refreshChain().catch((e) => showError(err, e));
      });
    }
  } catch (e) {
    showError(err, e);
  }
}

async function refreshChain() {
  const hex = await currentChainHex();
  const ok = onRightChain(hex);
  const sw = el("switch");
  if (sw) sw.hidden = ok;
  if (ok) {
    wallet.browser = new ethers.BrowserProvider(window.ethereum);
    wallet.signer = await wallet.browser.getSigner();
  } else {
    wallet.signer = null;
  }
  const line = el("wallet-line");
  if (line) {
    line.textContent = wallet.address ? `${short(wallet.address)}${ok ? "" : " — wrong network"}` : "not connected";
  }
  const c = el("connect");
  if (c) c.hidden = !!wallet.address;
  document.documentElement.dataset.wallet = wallet.address ? "on" : "off";
  if (wallet.onChange) await wallet.onChange();
}

function wireWalletButtons() {
  el("connect")?.addEventListener("click", connectWallet);
  el("switch")?.addEventListener("click", async () => {
    showError("wallet-err", null);
    try {
      await switchChain();
      await refreshChain();
    } catch (e) {
      showError("wallet-err", e);
    }
  });
}

// ERC-20 symbol with fallback to the address.
async function tokenSymbol(addr) {
  try {
    const s = await readContract(addr, ERC20_ABI).symbol();
    return s || short(addr);
  } catch (e) {
    return short(addr);
  }
}
async function tokenDecimals(addr) {
  try {
    return Number(await readContract(addr, ERC20_ABI).decimals());
  } catch (e) {
    return 18;
  }
}

// Sends a tx, shows the hash then the receipt on #<statusId>.
async function sendTx(statusId, errId, fn) {
  showError(errId, null);
  setText(statusId, "confirm in your wallet…");
  window.uiBusy?.(statusId, true);
  try {
    const tx = await fn();
    const s = el(statusId);
    if (s) s.innerHTML = "sent " + txLink(tx.hash) + " — waiting…";
    window.uiBusy?.(statusId, true);
    const rc = await tx.wait();
    window.uiBusy?.(statusId, false);
    if (s) s.innerHTML = (rc && rc.status === 1 ? "confirmed " : "failed ") + txLink(tx.hash);
    return rc;
  } catch (e) {
    window.uiBusy?.(statusId, false);
    setText(statusId, "");
    showError(errId, e);
    return null;
  }
}
