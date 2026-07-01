import { useState, useCallback } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";
import { requestAccess, signTransaction } from "@stellar/freighter-api";
import "./App.css";

const server = new StellarSdk.Horizon.Server("https://horizon-testnet.stellar.org");
const NETWORK = StellarSdk.Networks.TESTNET;

function App() {
  const [publicKey, setPublicKey] = useState(null);
  const [balance, setBalance] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [txHash, setTxHash] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1");
  const [memo, setMemo] = useState("");
  const [showFullRecipient, setShowFullRecipient] = useState(false);

  const fetchBalance = useCallback(async (pubKey) => {
    try {
      const account = await server.loadAccount(pubKey);
      const native = account.balances.find((b) => b.asset_type === "native");
      setBalance(native ? native.balance : "0");
    } catch (err) {
      console.error(err);
      setBalance("0");
    }
  }, []);

  const connectWallet = async () => {
    try {
      setStatus({ type: "info", message: "Connecting..." });
      const access = await requestAccess();
      setPublicKey(access.address);
      setRecipient(access.address);
      setStatus({ type: "info", message: "Fetching balance..." });
      await fetchBalance(access.address);
      setStatus({ type: "success", message: "Wallet connected successfully." });
      setTimeout(() => setStatus({ type: "", message: "" }), 3000);
    } catch (err) {
      setStatus({ type: "error", message: "Failed to connect wallet." });
    }
  };

  const disconnectWallet = () => {
    setPublicKey(null);
    setBalance(null);
    setTxHash(null);
    setRecipient("");
    setAmount("1");
    setMemo("");
    setShowFullRecipient(false);
    setStatus({ type: "", message: "" });
  };

  const isUserCancel = (err) => {
    const msg = (err && (err.message || err.toString() || "")) || "";
    return (
      msg.includes("User declined") ||
      msg.includes("cancel") ||
      msg.includes("reject") ||
      msg.includes("denied") ||
      msg.includes("ABORT") ||
      msg.includes("timeout") ||
      msg.includes("XDR Read") ||
      msg.includes("buffer")
    );
  };

  const sendPayment = async () => {
    if (!publicKey) return;
    if (!recipient.trim() || !recipient.startsWith("G") || recipient.length !== 56) {
      setStatus({ type: "error", message: "Invalid recipient address." });
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setStatus({ type: "error", message: "Invalid amount." });
      return;
    }
    try {
      setLoading(true);
      setTxHash(null);
      setStatus({ type: "info", message: "Preparing transaction..." });
      const account = await server.loadAccount(publicKey);
      const tx = new StellarSdk.TransactionBuilder(account, { fee: StellarSdk.BASE_FEE, networkPassphrase: NETWORK })
        .addOperation(
          StellarSdk.Operation.payment({ destination: recipient.trim(), asset: StellarSdk.Asset.native(), amount: numAmount.toString() })
        )
        .setTimeout(30);
      if (memo.trim()) tx.addMemo(StellarSdk.Memo.text(memo.trim()));
      const transaction = tx.build();
      setStatus({ type: "info", message: "Awaiting confirmation..." });
      const signedResult = await signTransaction(transaction.toXDR(), { networkPassphrase: NETWORK });
      const signedXdr = typeof signedResult === "string" ? signedResult : signedResult.signedTxXdr;
      const result = await server.submitTransaction(StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK));
      setTxHash(result.hash);
      setStatus({ type: "success", message: numAmount + " XLM sent successfully." });
      await fetchBalance(publicKey);
    } catch (err) {
      console.error(err);
      if (isUserCancel(err)) {
        setStatus({ type: "info", message: "Transaction cancelled." });
        setTimeout(() => setStatus({ type: "", message: "" }), 3000);
      } else {
        setTxHash(null);
        setStatus({ type: "error", message: "Transaction failed." });
      }
    } finally {
      setLoading(false);
    }
  };

  const shortenKey = (key) => {
    if (!key || key.length < 10) return key;
    return key.slice(0, 6) + "..." + key.slice(-6);
  };

  const formatBalance = (bal) => {
    if (bal === null || bal === undefined) return "...";
    const num = parseFloat(bal);
    return isNaN(num) ? "0" : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 });
  };

  return (
    <div className="app-container">
      <div className="card">
        <div className="card-header">
          <div className="logo">&#9733;</div>
          <h1 className="title">Stellar Simple Payment dApp</h1>
          <p className="subtitle">Level 1 — White Belt</p>
        </div>
        <div className="divider" />
        {!publicKey ? (
          <button className="btn btn-primary" onClick={connectWallet}>Connect Freighter Wallet</button>
        ) : (
          <>
            <div className="info-row">
              <span className="info-label">Wallet Address</span>
              <span className="info-value">{shortenKey(publicKey)}</span>
            </div>
            <div className="balance-badge">
              <span>XLM</span>
              {formatBalance(balance)}
            </div>
            <div className="form-group">
              <label className="form-label">Recipient Address</label>
              <div className="input-with-toggle">
                <input type={showFullRecipient ? "text" : "password"} className="form-input" placeholder="G..." value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                <button className="eye-btn" onClick={() => setShowFullRecipient(!showFullRecipient)}>
                  {showFullRecipient ? "🙈" : "👁"}
                </button>
              </div>
              <button type="button" className="form-hint" onClick={() => { setRecipient(publicKey); setShowFullRecipient(true); }}>Use my own address</button>
            </div>
            <div className="form-group">
              <label className="form-label">Amount (XLM)</label>
              <input type="number" className="form-input" placeholder="1.00" step="0.0000001" min="0.0000001" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Memo (Optional)</label>
              <input type="text" className="form-input" placeholder="Transaction note..." value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
            <button className="btn btn-send" onClick={sendPayment} disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? "Sending..." : "Send " + (amount || "1") + " XLM"}
            </button>
            <button className="btn btn-disconnect" onClick={disconnectWallet}>Disconnect</button>
          </>
        )}
        {status.message && <div className={"status-message " + status.type}><span>{status.message}</span></div>}
        {txHash && <a className="tx-link" href={"https://stellar.expert/explorer/testnet/tx/" + txHash} target="_blank" rel="noopener noreferrer">View Transaction on Stellar Expert</a>}
        <p className="footer-note">Stellar Testnet — Horizon Testnet</p>
      </div>
    </div>
  );
}

export default App;
