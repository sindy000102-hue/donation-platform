import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import contractData from "./contracts/TransparentDonation.json";
import Admin from "./Admin";
import Celebrate from "./Celebrate";
import Community from "./Community";
import { ProfileSetup } from "./Profile";
import MyPage from "./MyPage";
import "./Profile.css";
import "./App.css";

const CONTRACT_ADDRESS = "0x53aF2E34dcc550Db2059A446C4E8Bf669D3660d1";
const CONTRACT_ABI = contractData.abi;

const shorten = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
const formatETH = (wei) => { try { return parseFloat(ethers.formatEther(wei)).toFixed(4); } catch { return "0.0000"; } };
const timeLeft = (deadline) => {
  const diff = Number(deadline) - Date.now() / 1000;
  if (diff <= 0) return "마감됨";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  return d > 0 ? `${d}일 ${h}시간 남음` : `${h}시간 남음`;
};
const pct = (raised, goal) => {
  const r = parseFloat(ethers.formatEther(raised));
  const g = parseFloat(ethers.formatEther(goal));
  return g > 0 ? Math.min(100, (r / g) * 100) : 0;
};
const getMilestone = (beforePct, afterPct) => {
  const thresholds = [25, 50, 75, 100];
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (beforePct < thresholds[i] && afterPct >= thresholds[i]) return thresholds[i];
  }
  return null;
};

export default function App() {
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);
  const [isOwner, setIsOwner] = useState(false);

  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState("");
  const [lastTxHash, setLastTxHash] = useState(null);

  // 페이지/역할
  const [role, setRole] = useState("donor"); // "donor" | "org"
  const [showAdmin, setShowAdmin] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showMyPage, setShowMyPage] = useState(false);
  const [celebrateMilestone, setCelebrateMilestone] = useState(null);

  // 캠페인 생성 폼
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", goal: "", days: "30" });
  const [campaignImagePreview, setCampaignImagePreview] = useState(null);

  // 증빙 사진
  const [evidenceImages, setEvidenceImages] = useState({});
  const [showEvidence, setShowEvidence] = useState(null);
  const [evidencePreview, setEvidencePreview] = useState(null);
  const [evidenceMsg, setEvidenceMsg] = useState("");

  // 기부 폼
  const [donateAmt, setDonateAmt] = useState("");
  const [donateMsg, setDonateMsg] = useState("");

  // ── 지갑 연결 ──
  const connectWallet = async () => {
    if (typeof window.ethereum === "undefined") return showToast("MetaMask를 설치해주세요!");
    try {
      const prov = new ethers.BrowserProvider(window.ethereum);
      const accounts = await prov.send("eth_requestAccounts", []);
      const sign = await prov.getSigner();
      const cont = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, sign);
      setContract(cont);
      setAccount(accounts[0]);
      try {
        const owner = await cont.owner();
        setIsOwner(owner.toLowerCase() === accounts[0].toLowerCase());
      } catch { setIsOwner(false); }
      showToast("지갑 연결 완료!");
    } catch (err) { showToast("지갑 연결 실패: " + err.message); }
  };

  // ── 캠페인 로드 ──
  const loadCampaigns = useCallback(async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const count = await contract.campaignCount();
      const list = [];
      for (let i = 0; i < Number(count); i++) list.push(await contract.getCampaign(i));
      setCampaigns(list);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [contract]);

  useEffect(() => { if (contract) loadCampaigns(); }, [contract, loadCampaigns]);

  // ── 저장된 증빙 로드 ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("evidenceImages");
      if (saved) setEvidenceImages(JSON.parse(saved));
    } catch {}
  }, []);

  const openCampaign = async (campaign) => {
    setSelected(campaign);
    try {
      const donList = await contract.getDonations(Number(campaign.id));
      setDonations(donList);
    } catch { setDonations([]); }
  };

  // ── 캠페인 생성 (기관용) ──
  const handleCreate = async () => {
    if (!contract) return showToast("지갑을 먼저 연결해주세요");
    if (!form.title.trim()) return showToast("캠페인 제목을 입력해주세요");
    if (!form.description.trim()) return showToast("캠페인 설명을 입력해주세요");
    const goalNum = parseFloat(form.goal);
    const daysNum = parseInt(form.days);
    if (!goalNum || goalNum <= 0) return showToast("목표 금액은 0보다 커야 합니다");
    if (!daysNum || daysNum <= 0) return showToast("기간은 1일 이상이어야 합니다");
    if (daysNum > 365) return showToast("기간은 최대 365일입니다");

    setLoading(true);
    try {
      const imageHash = campaignImagePreview ? "local_preview" : "";
      const tx = await contract.createCampaign(form.title, form.description, imageHash, ethers.parseEther(form.goal), daysNum);
      showToast("⏳ 트랜잭션 처리 중...");
      await tx.wait();
      showToast("✅ 캠페인 생성 완료!", tx.hash);
      setForm({ title: "", description: "", goal: "", days: "30" });
      setCampaignImagePreview(null);
      setShowCreate(false);
      await loadCampaigns();
    } catch (err) { showToast("❌ 생성 실패: " + (err.reason || err.message)); }
    setLoading(false);
  };

  // ── 기부 ──
  const handleDonate = async () => {
    if (!contract) return showToast("지갑을 먼저 연결해주세요");
    const amt = parseFloat(donateAmt);
    if (!amt || amt <= 0) return showToast("기부 금액은 0보다 커야 합니다");
    setLoading(true);
    try {
      const beforePct = pct(selected.raisedAmount, selected.goalAmount);
      const tx = await contract.donate(Number(selected.id), donateMsg, { value: ethers.parseEther(donateAmt) });
      showToast("⏳ 트랜잭션 처리 중...");
      await tx.wait();
      showToast("✅ 기부 완료! 감사합니다 💚", tx.hash);
      setDonateAmt(""); setDonateMsg("");
      await loadCampaigns();
      const updated = await contract.getCampaign(Number(selected.id));
      setSelected(updated);
      const donList = await contract.getDonations(Number(selected.id));
      setDonations(donList);
      const afterPct = pct(updated.raisedAmount, updated.goalAmount);
      const milestone = getMilestone(beforePct, afterPct);
      if (milestone) setCelebrateMilestone(milestone);
    } catch (err) { showToast("❌ 기부 실패: " + (err.reason || err.message)); }
    setLoading(false);
  };

  // ── 인출 ──
  const handleWithdraw = async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.withdraw(Number(selected.id));
      showToast("⏳ 인출 처리 중...");
      await tx.wait();
      showToast("✅ 인출 완료!", tx.hash);
      await loadCampaigns();
      const updated = await contract.getCampaign(Number(selected.id));
      setSelected(updated);
    } catch (err) { showToast("❌ 인출 실패: " + (err.reason || err.message)); }
    setLoading(false);
  };

  // ── 이미지 핸들러 ──
  const handleImageSelect = (e, previewSetter) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showToast("이미지는 5MB 이하만 가능합니다");
    const reader = new FileReader();
    reader.onload = (ev) => previewSetter(ev.target.result);
    reader.readAsDataURL(file);
  };

  // ── 증빙 사진 저장 ──
  const handleSaveEvidence = () => {
    if (!evidencePreview) return showToast("증빙 사진을 선택해주세요");
    const cId = Number(showEvidence.id);
    const updated = {
      ...evidenceImages,
      [cId]: [...(evidenceImages[cId] || []), { image: evidencePreview, message: evidenceMsg, date: new Date().toISOString() }],
    };
    setEvidenceImages(updated);
    localStorage.setItem("evidenceImages", JSON.stringify(updated));
    setEvidencePreview(null); setEvidenceMsg("");
    showToast("✅ 증빙 사진이 등록되었습니다!");
  };

  const showToast = (msg, txHash = null) => {
    setTxStatus(msg);
    setLastTxHash(txHash);
    setTimeout(() => { setTxStatus(""); setLastTxHash(null); }, txHash ? 8000 : 4000);
  };
  const icons = ["🐾", "📚", "🔥", "🌍", "💚", "🏠", "🎓", "🌱"];

  // ── 축하 ──
  if (celebrateMilestone) return <Celebrate milestone={celebrateMilestone} onClose={() => setCelebrateMilestone(null)} />;
  // ── 관리자 ──
  if (showAdmin) return <Admin contract={contract} account={account} onBack={() => setShowAdmin(false)} />;
  // ── 커뮤니티 ──
  if (showCommunity) return <Community account={account} role={role} onBack={() => setShowCommunity(false)} allDonationList={donations} />;
  // ── 마이페이지 ──
  if (showMyPage) return <MyPage contract={contract} account={account} onBack={() => setShowMyPage(false)} allDonationList={donations} />;

  // ════════════════════════════════
  // 증빙 사진 모달
  // ════════════════════════════════
  const renderEvidenceModal = () => {
    if (!showEvidence) return null;
    const cId = Number(showEvidence.id);
    const evidList = evidenceImages[cId] || [];
    const isCreator = account && showEvidence.creator.toLowerCase() === account.toLowerCase();

    return (
      <div className="modal" onClick={(e) => e.target === e.currentTarget && setShowEvidence(null)}>
        <div className="modal-box evidence-modal">
          <h2>📸 기부금 사용 증빙</h2>
          <p className="evidence-campaign-name">{showEvidence.title}</p>

          {/* 기관이면 업로드 가능 */}
          {isCreator && (
            <div className="evidence-upload">
              <label className="file-upload-label">
                {evidencePreview ? (
                  <img src={evidencePreview} alt="미리보기" className="evidence-preview-img" />
                ) : (
                  <div className="file-upload-placeholder">📷 사진 선택 (영수증, 사용 내역 등)</div>
                )}
                <input type="file" accept="image/*" onChange={(e) => handleImageSelect(e, setEvidencePreview)} hidden />
              </label>
              <input placeholder="설명 (예: 건축 자재 구입 영수증)" value={evidenceMsg} onChange={(e) => setEvidenceMsg(e.target.value)} />
              <button className="submit-btn" onClick={handleSaveEvidence}>증빙 등록</button>
            </div>
          )}

          {/* 증빙 목록 */}
          {evidList.length === 0 ? (
            <div className="empty">아직 등록된 증빙이 없습니다</div>
          ) : (
            evidList.map((ev, i) => (
              <div key={i} className="evidence-item">
                <img src={ev.image} alt="증빙" className="evidence-img" />
                <div className="evidence-info">
                  <p>{ev.message || "증빙 사진"}</p>
                  <span>{new Date(ev.date).toLocaleDateString("ko-KR")}</span>
                </div>
              </div>
            ))
          )}

          <button className="cancel-btn" onClick={() => { setShowEvidence(null); setEvidencePreview(null); setEvidenceMsg(""); }}>닫기</button>
        </div>
      </div>
    );
  };

  // ════════════════════════════════
  // 상세 페이지
  // ════════════════════════════════
  if (selected) {
    const p = pct(selected.raisedAmount, selected.goalAmount);
    const isCreator = account && selected.creator.toLowerCase() === account.toLowerCase();
    const deadlinePassed = Number(selected.deadline) < Date.now() / 1000;
    const cId = Number(selected.id);
    const evidList = evidenceImages[cId] || [];

    return (
      <div className="app">
        <header className="header">
          <div className="logo"><div className="logo-dot" /> 투명기부</div>
          <div className="header-right">
            {isOwner && <button className="admin-link" onClick={() => { setSelected(null); setShowAdmin(true); }}>👑 관리자</button>}
            <button className="comm-link" onClick={() => { setSelected(null); setShowCommunity(true); }}>📋 게시판</button>
            <div className="role-toggle">
              <button className={role === "donor" ? "active" : ""} onClick={() => setRole("donor")}>기부자</button>
              <button className={role === "org" ? "active" : ""} onClick={() => setRole("org")}>기관</button>
            </div>
            <button className="wallet-btn" onClick={connectWallet}>{account ? shorten(account) : "🦊 지갑 연결"}</button>
          </div>
        </header>
        <main className="main">
          <button className="back-btn" onClick={() => setSelected(null)}>← 목록으로</button>
          <div className="detail-header">
            <div className="detail-icon">{icons[cId % icons.length]}</div>
            <h1 className="detail-title">{selected.title}</h1>
            <p className="detail-creator">생성자: {shorten(selected.creator)}</p>
          </div>

          {/* 캠페인 설명 */}
          <div className="detail-desc-box">
            <h3>📝 캠페인 소개</h3>
            <p className="detail-desc">{selected.description}</p>
          </div>

          {/* 프로그레스 */}
          <div className="progress-section">
            <div className="progress-labels">
              <span className="raised">{formatETH(selected.raisedAmount)} ETH</span>
              <span className="goal">목표 {formatETH(selected.goalAmount)} ETH</span>
            </div>
            <div className="progress-bar large">
              <div className="progress-fill" style={{ width: `${p}%` }} />
            </div>
            <div className="progress-meta">
              <span>{p.toFixed(1)}% 달성</span>
              <span>{timeLeft(selected.deadline)}</span>
            </div>
            {/* 마일스톤 표시 */}
            <div className="milestones">
              {[25, 50, 75, 100].map((m) => (
                <div key={m} className={`milestone-dot ${p >= m ? "reached" : ""}`}>
                  <span>{m}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* 기부 폼 (기부자용) */}
          {selected.isActive && !deadlinePassed && (
            <div className="donate-form">
              <h3>💚 기부하기</h3>
              <input type="number" step="0.001" min="0.001" placeholder="기부 금액 (ETH)" value={donateAmt} onChange={(e) => setDonateAmt(e.target.value)} />
              <input placeholder="응원 메시지 (선택)" value={donateMsg} onChange={(e) => setDonateMsg(e.target.value)} />
              <button className="submit-btn" onClick={handleDonate} disabled={loading}>{loading ? "처리 중..." : "기부하기"}</button>
            </div>
          )}

          {/* 인출 (기관용) */}
          {isCreator && deadlinePassed && selected.raisedAmount > 0n && (
            <button className="submit-btn withdraw" onClick={handleWithdraw} disabled={loading}>💰 모금액 인출</button>
          )}

          {/* 증빙 사진 섹션 */}
          {(deadlinePassed || !selected.isActive) && (
            <div className="evidence-section">
              <div className="evidence-header">
                <h3>📸 기부금 사용 증빙</h3>
                {isCreator && <button className="evidence-add-btn" onClick={() => setShowEvidence(selected)}>+ 증빙 등록</button>}
              </div>
              {evidList.length === 0 ? (
                <div className="empty small">아직 등록된 증빙이 없습니다</div>
              ) : (
                <div className="evidence-grid">
                  {evidList.map((ev, i) => (
                    <div key={i} className="evidence-card" onClick={() => setShowEvidence(selected)}>
                      <img src={ev.image} alt="증빙" />
                      <p>{ev.message || "증빙 사진"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 기부 내역 */}
          <h3 className="section-title">📋 기부 내역 ({donations.length}건)</h3>
          {donations.length === 0 ? (
            <div className="empty">아직 기부 내역이 없습니다</div>
          ) : (
            donations.map((d, i) => (
              <div key={i} className="donation-item">
                <div className="donation-header">
                  <span className="donor">{shorten(d.donor)}</span>
                  <span className="amount">{formatETH(d.amount)} ETH</span>
                </div>
                {d.message && <div className="donation-msg">"{d.message}"</div>}
                <div className="donation-time">{new Date(Number(d.timestamp) * 1000).toLocaleString("ko-KR")}</div>
              </div>
            ))
          )}
        </main>
        {txStatus && <div className="toast">{txStatus}{lastTxHash && <a href={`https://sepolia.etherscan.io/tx/${lastTxHash}`} target="_blank" rel="noopener noreferrer" className="tx-link">🔗 Etherscan에서 확인</a>}</div>}
        {loading && <div className="loading-overlay"><div className="spinner" /></div>}
        {renderEvidenceModal()}
      {showProfile && <ProfileSetup account={account} onClose={() => setShowProfile(false)} onSave={() => {}} />}
      </div>
    );
  }

  // ════════════════════════════════
  // 홈
  // ════════════════════════════════
  const myCampaigns = campaigns.filter((c) => account && c.creator.toLowerCase() === account.toLowerCase());

  return (
    <div className="app">
      <header className="header">
        <div className="logo"><div className="logo-dot" /> 투명기부</div>
        <div className="header-right">
          {isOwner && <button className="admin-link" onClick={() => setShowAdmin(true)}>👑 관리자</button>}
          <button className="comm-link" onClick={() => setShowCommunity(true)}>📋 게시판</button>
          {account && <button className="profile-link" onClick={() => setShowProfile(true)}>👤</button>}
          <div className="role-toggle">
            <button className={role === "donor" ? "active" : ""} onClick={() => setRole("donor")}>기부자</button>
            <button className={role === "org" ? "active" : ""} onClick={() => setRole("org")}>기관</button>
          </div>
          <button className="wallet-btn" onClick={connectWallet}>{account ? shorten(account) : "🦊 지갑 연결"}</button>
        </div>
      </header>

      <main className="main">
        {role === "donor" ? (
          /* ── 기부자 뷰 ── */
          <>
            <div className="hero">
              <h1>블록체인 위의<br />투명한 나눔</h1>
              <p>모든 기부 내역이 블록체인에 영구 기록됩니다.<br />누구나 검증할 수 있는 진정한 투명 기부 플랫폼.</p>
            </div>
            {!account ? (
              <div className="connect-prompt">
                <p>지갑을 연결하면 캠페인을 확인할 수 있어요</p>
                <button className="submit-btn" onClick={connectWallet}>🦊 MetaMask 연결하기</button>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="empty">아직 생성된 캠페인이 없습니다.</div>
            ) : (
              <div className="grid">
                {campaigns.filter(c => c.isActive).map((c, idx) => {
                  const p = pct(c.raisedAmount, c.goalAmount);
                  return (
                    <div key={idx} className="card" onClick={() => openCampaign(c)}>
                      <div className="card-img">{icons[Number(c.id) % icons.length]}</div>
                      <span className="badge active">진행중</span>
                      <div className="card-body">
                        <div className="card-title">{c.title}</div>
                        <div className="card-desc">{c.description}</div>
                        <div className="progress-bar"><div className="progress-fill" style={{ width: `${p}%` }} /></div>
                        <div className="card-meta">
                          <span>{formatETH(c.raisedAmount)} / {formatETH(c.goalAmount)} ETH</span>
                          <span>{timeLeft(c.deadline)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* ── 기관 뷰 ── */
          <>
            <div className="hero org-hero">
              <h1>🏛 기관 관리</h1>
              <p>캠페인을 만들고, 기부금 사용 내역을 투명하게 공개하세요.</p>
            </div>
            {!account ? (
              <div className="connect-prompt">
                <p>지갑을 연결하면 캠페인을 관리할 수 있어요</p>
                <button className="submit-btn" onClick={connectWallet}>🦊 MetaMask 연결하기</button>
              </div>
            ) : (
              <>
                <button className="create-campaign-btn" onClick={() => setShowCreate(true)}>✨ 새 캠페인 만들기</button>
                {myCampaigns.length === 0 ? (
                  <div className="empty">아직 생성한 캠페인이 없습니다.<br />위 버튼으로 첫 캠페인을 만들어보세요!</div>
                ) : (
                  <div className="grid">
                    {myCampaigns.map((c, idx) => {
                      const p = pct(c.raisedAmount, c.goalAmount);
                      const cId = Number(c.id);
                      const hasEvidence = (evidenceImages[cId] || []).length > 0;
                      return (
                        <div key={idx} className="card org-card" onClick={() => openCampaign(c)}>
                          <div className="card-img org">{icons[cId % icons.length]}</div>
                          <span className={`badge ${c.isActive ? "active" : ""}`}>{c.isActive ? "진행중" : "마감"}</span>
                          {hasEvidence && <span className="badge evidence-badge">📸 증빙완료</span>}
                          <div className="card-body">
                            <div className="card-title">{c.title}</div>
                            <div className="progress-bar"><div className="progress-fill" style={{ width: `${p}%` }} /></div>
                            <div className="card-meta">
                              <span>{formatETH(c.raisedAmount)} / {formatETH(c.goalAmount)} ETH</span>
                              <span>{timeLeft(c.deadline)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* FAB - 기관 모드에서만 */}
      {account && role === "org" && <button className="fab" onClick={() => setShowCreate(true)}>+</button>}

      {/* 캠페인 생성 모달 */}
      {showCreate && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal-box">
            <h2>✨ 새 캠페인 만들기</h2>

            {/* 사진 업로드 */}
            <label>캠페인 대표 사진</label>
            <label className="file-upload-label">
              {campaignImagePreview ? (
                <img src={campaignImagePreview} alt="미리보기" className="campaign-preview-img" />
              ) : (
                <div className="file-upload-placeholder">📷 클릭하여 사진 업로드<br /><small>기부가 필요한 이유를 어필할 사진</small></div>
              )}
              <input type="file" accept="image/*" onChange={(e) => handleImageSelect(e, setCampaignImagePreview)} hidden />
            </label>

            <label>캠페인 제목</label>
            <input placeholder="예: 유기동물 보호소 건립" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <label>왜 기부가 필요한가요? (상세 설명)</label>
            <textarea placeholder="기부금이 어떻게 사용될 예정인지 자세히 설명해주세요" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
            <div className="form-row">
              <div>
                <label>목표 금액 (ETH)</label>
                <input type="number" step="0.01" min="0.01" placeholder="1.0" value={form.goal}
                  onChange={(e) => { const v = e.target.value; if (v === "" || parseFloat(v) >= 0) setForm({ ...form, goal: v }); }} />
              </div>
              <div>
                <label>기간 (일)</label>
                <input type="number" min="1" max="365" placeholder="30" value={form.days}
                  onChange={(e) => { const v = e.target.value; if (v === "" || parseInt(v) >= 0) setForm({ ...form, days: v }); }} />
              </div>
            </div>
            <button className="submit-btn" onClick={handleCreate} disabled={loading}>{loading ? "처리 중..." : "캠페인 생성"}</button>
            <button className="cancel-btn" onClick={() => { setShowCreate(false); setCampaignImagePreview(null); }}>취소</button>
          </div>
        </div>
      )}

      {txStatus && <div className="toast">{txStatus}{lastTxHash && <a href={`https://sepolia.etherscan.io/tx/${lastTxHash}`} target="_blank" rel="noopener noreferrer" className="tx-link">🔗 Etherscan에서 확인</a>}</div>}
      {loading && <div className="loading-overlay"><div className="spinner" /></div>}
      {renderEvidenceModal()}
      {showProfile && <ProfileSetup account={account} onClose={() => setShowProfile(false)} onSave={() => {}} />}

      {/* 하단 네비게이션 */}
      {account && (
        <nav className="bottom-nav">
          <button className="nav-item active" onClick={() => { setShowCommunity(false); setShowAdmin(false); }}>
            <span className="nav-icon">🏠</span><span>홈</span>
          </button>
          <button className="nav-item" onClick={() => setShowCommunity(true)}>
            <span className="nav-icon">📋</span><span>게시판</span>
          </button>
          <button className="nav-item" onClick={() => setShowMyPage(true)}>
            <span className="nav-icon">🎫</span><span>마이페이지</span>
          </button>
          {isOwner && (
            <button className="nav-item" onClick={() => setShowAdmin(true)}>
              <span className="nav-icon">👑</span><span>관리자</span>
            </button>
          )}
          <button className="nav-item" onClick={() => setShowProfile(true)}>
            <span className="nav-icon">👤</span><span>프로필</span>
          </button>
        </nav>
      )}
    </div>
  );
}
