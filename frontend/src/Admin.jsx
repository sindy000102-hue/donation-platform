import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "./Admin.css";

const formatETH = (wei) => {
  try {
    return parseFloat(ethers.formatEther(wei)).toFixed(4);
  } catch {
    return "0.0000";
  }
};
const shorten = (addr) =>
  addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
const timeLeft = (deadline) => {
  const diff = Number(deadline) - Date.now() / 1000;
  if (diff <= 0) return "마감됨";
  const d = Math.floor(diff / 86400);
  return d > 0 ? `${d}일 남음` : "오늘 마감";
};
const pct = (raised, goal) => {
  const r = parseFloat(ethers.formatEther(raised));
  const g = parseFloat(ethers.formatEther(goal));
  return g > 0 ? Math.min(100, (r / g) * 100) : 0;
};

export default function Admin({ contract, account, onBack }) {
  const [campaigns, setCampaigns] = useState([]);
  const [allDonations, setAllDonations] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState("dashboard");
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  const handleDeactivate = async (campaignId) => {
    if (!window.confirm("정말 이 캠페인을 삭제하시겠습니까?\n모금액이 있으면 기부자에게 환불됩니다.")) return;
    setActionLoading(campaignId);
    try {
      const tx = await contract.deactivateCampaign(campaignId);
      showToast("⏳ 트랜잭션 처리 중...");
      await tx.wait();
      showToast("✅ 캠페인이 삭제되었습니다");
      await loadAll();
    } catch (err) {
      showToast("❌ 삭제 실패: " + (err.reason || err.message));
    }
    setActionLoading(null);
  };

  useEffect(() => {
    loadAll();
  }, [contract]);

  const loadAll = async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const count = await contract.campaignCount();
      const cList = [];
      const dMap = {};
      for (let i = 0; i < Number(count); i++) {
        const c = await contract.getCampaign(i);
        cList.push(c);
        const dons = await contract.getDonations(i);
        dMap[i] = dons;
      }
      setCampaigns(cList);
      setAllDonations(dMap);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // ── 통계 계산 ──
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c) => c.isActive).length;
  const completedCampaigns = campaigns.filter((c) => {
    const p = pct(c.raisedAmount, c.goalAmount);
    return p >= 100;
  }).length;

  let totalRaisedWei = 0n;
  let totalDonationCount = 0;
  const uniqueDonors = new Set();
  const donationsByDay = {};

  Object.values(allDonations).forEach((dons) => {
    dons.forEach((d) => {
      totalRaisedWei += d.amount;
      totalDonationCount++;
      uniqueDonors.add(d.donor.toLowerCase());
      const day = new Date(Number(d.timestamp) * 1000)
        .toISOString()
        .slice(0, 10);
      donationsByDay[day] = (donationsByDay[day] || 0) + 1;
    });
  });

  const totalRaised = formatETH(totalRaisedWei);
  const avgDonation =
    totalDonationCount > 0
      ? formatETH(totalRaisedWei / BigInt(totalDonationCount))
      : "0.0000";

  // 최근 7일 기부 추이
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7.push({ date: key.slice(5), count: donationsByDay[key] || 0 });
  }
  const maxCount = Math.max(...last7.map((d) => d.count), 1);

  if (loading) {
    return (
      <div className="admin-app">
        <div className="admin-loading">
          <div className="spinner" />
          <p>데이터 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-app">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-left">
          <button className="admin-back" onClick={onBack}>
            ← 돌아가기
          </button>
          <h1>👑 관리자 대시보드</h1>
        </div>
        <div className="admin-account">{shorten(account)}</div>
      </header>

      {/* Tabs */}
      <div className="admin-tabs">
        <button
          className={`tab ${selectedTab === "dashboard" ? "active" : ""}`}
          onClick={() => setSelectedTab("dashboard")}
        >
          📊 통계
        </button>
        <button
          className={`tab ${selectedTab === "campaigns" ? "active" : ""}`}
          onClick={() => setSelectedTab("campaigns")}
        >
          📋 캠페인 관리
        </button>
        <button
          className={`tab ${selectedTab === "donations" ? "active" : ""}`}
          onClick={() => setSelectedTab("donations")}
        >
          💰 기부 내역
        </button>
      </div>

      <main className="admin-main">
        {/* ═══ 통계 탭 ═══ */}
        {selectedTab === "dashboard" && (
          <>
            {/* 상단 카드 */}
            <div className="stat-grid">
              <div className="stat-card highlight">
                <div className="stat-icon">💰</div>
                <div className="stat-value">{totalRaised}</div>
                <div className="stat-label">총 모금액 (ETH)</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📝</div>
                <div className="stat-value">{totalCampaigns}</div>
                <div className="stat-label">전체 캠페인</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🟢</div>
                <div className="stat-value">{activeCampaigns}</div>
                <div className="stat-label">진행 중</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🎉</div>
                <div className="stat-value">{completedCampaigns}</div>
                <div className="stat-label">목표 달성</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🤝</div>
                <div className="stat-value">{totalDonationCount}</div>
                <div className="stat-label">총 기부 건수</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">👥</div>
                <div className="stat-value">{uniqueDonors.size}</div>
                <div className="stat-label">참여자 수</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📈</div>
                <div className="stat-value">{avgDonation}</div>
                <div className="stat-label">평균 기부액 (ETH)</div>
              </div>
            </div>

            {/* 기부 추이 차트 */}
            <div className="chart-card">
              <h3>📊 최근 7일 기부 추이</h3>
              <div className="bar-chart">
                {last7.map((d, i) => (
                  <div key={i} className="bar-col">
                    <div className="bar-value">{d.count}</div>
                    <div
                      className="bar"
                      style={{
                        height: `${(d.count / maxCount) * 120}px`,
                      }}
                    />
                    <div className="bar-label">{d.date}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ═══ 캠페인 관리 탭 ═══ */}
        {selectedTab === "campaigns" && (
          <div className="campaign-list">
            {campaigns.length === 0 ? (
              <div className="admin-empty">캠페인이 없습니다</div>
            ) : (
              campaigns.map((c, idx) => {
                const p = pct(c.raisedAmount, c.goalAmount);
                const goalReached = p >= 100;
                const dons = allDonations[idx] || [];
                return (
                  <div
                    key={idx}
                    className={`campaign-row ${goalReached ? "goal-reached" : ""}`}
                  >
                    {goalReached && (
                      <div className="crown-badge">👑 목표 달성!</div>
                    )}
                    <div className="campaign-row-top">
                      <div className="campaign-info">
                        <h4>
                          #{Number(c.id)} {c.title}
                        </h4>
                        <p className="campaign-creator">
                          생성자: {shorten(c.creator)}
                        </p>
                      </div>
                      <div className="campaign-status">
                        <span
                          className={`status-badge ${c.isActive ? "active" : "closed"}`}
                        >
                          {c.isActive ? "진행중" : "마감"}
                        </span>
                        {c.isActive && (
                          <button
                            className="delete-btn"
                            onClick={() => handleDeactivate(Number(c.id))}
                            disabled={actionLoading === Number(c.id)}
                          >
                            {actionLoading === Number(c.id) ? "처리중..." : "🗑 삭제"}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="campaign-row-mid">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${p}%` }}
                        />
                      </div>
                      <div className="campaign-row-stats">
                        <span>
                          {formatETH(c.raisedAmount)} / {formatETH(c.goalAmount)}{" "}
                          ETH ({p.toFixed(1)}%)
                        </span>
                        <span>기부 {dons.length}건</span>
                        <span>{timeLeft(c.deadline)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ═══ 기부 내역 탭 ═══ */}
        {selectedTab === "donations" && (
          <div className="donation-table">
            <div className="table-header">
              <span>캠페인</span>
              <span>기부자</span>
              <span>금액</span>
              <span>메시지</span>
              <span>시간</span>
            </div>
            {totalDonationCount === 0 ? (
              <div className="admin-empty">기부 내역이 없습니다</div>
            ) : (
              campaigns.map((c, cIdx) =>
                (allDonations[cIdx] || []).map((d, dIdx) => (
                  <div key={`${cIdx}-${dIdx}`} className="table-row">
                    <span className="cell-campaign">#{Number(c.id)} {c.title}</span>
                    <span className="cell-donor">{shorten(d.donor)}</span>
                    <span className="cell-amount">
                      {formatETH(d.amount)} ETH
                    </span>
                    <span className="cell-msg">{d.message || "-"}</span>
                    <span className="cell-time">
                      {new Date(Number(d.timestamp) * 1000).toLocaleString(
                        "ko-KR"
                      )}
                    </span>
                  </div>
                ))
              )
            )}
          </div>
        )}
      </main>
      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
