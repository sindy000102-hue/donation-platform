import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { DisplayName } from "./Profile";
import "./MyPage.css";

const formatETH = (wei) => {
  try { return parseFloat(ethers.formatEther(wei)).toFixed(4); } catch { return "0.0000"; }
};
const shorten = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

export default function MyPage({ contract, account, onBack, allDonationList }) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview"); // overview | nfts | history | milestones
  const [myDonations, setMyDonations] = useState([]);
  const [myNFTs, setMyNFTs] = useState([]);
  const [myCampaigns, setMyCampaigns] = useState([]);
  const [allCampaigns, setAllCampaigns] = useState([]);
  const [milestonesData, setMilestonesData] = useState({});

  useEffect(() => {
    if (contract && account) loadMyData();
  }, [contract, account]);

  const loadMyData = async () => {
    setLoading(true);
    try {
      const count = await contract.campaignCount();
      const donations = [];
      const nfts = [];
      const campaigns = [];
      const allCamps = [];
      const msData = {};

      for (let i = 0; i < Number(count); i++) {
        const campaign = await contract.getCampaign(i);
        allCamps.push(campaign);

        // 내가 만든 캠페인
        if (campaign.creator.toLowerCase() === account.toLowerCase()) {
          campaigns.push(campaign);
          try {
            const ms = await contract.getMilestones(i);
            msData[i] = ms;
          } catch {}
        }

        // 내 기부 내역
        const donList = await contract.getDonations(i);
        donList.forEach((d) => {
          if (d.donor.toLowerCase() === account.toLowerCase()) {
            donations.push({ ...d, campaignId: i, campaignTitle: campaign.title });

            // NFT 정보
            nfts.push({
              tokenId: Number(d.nftTokenId),
              campaignTitle: campaign.title,
              campaignId: i,
              amount: d.amount,
              timestamp: d.timestamp,
              donor: d.donor,
            });
          }
        });
      }

      setMyDonations(donations);
      setMyNFTs(nfts);
      setMyCampaigns(campaigns);
      setAllCampaigns(allCamps);
      setMilestonesData(msData);
    } catch (err) {
      console.error("마이페이지 데이터 로딩 실패:", err);
    }
    setLoading(false);
  };

  // ── 통계 계산 ──
  let totalDonated = 0n;
  myDonations.forEach((d) => { totalDonated += d.amount; });
  const uniqueCampaigns = new Set(myDonations.map((d) => d.campaignId)).size;

  // ── 마일스톤 퍼센트 ──
  const msPercents = [25, 50, 75, 100];

  if (loading) {
    return (
      <div className="mypage">
        <header className="mypage-header">
          <button className="mypage-back" onClick={onBack}>← 돌아가기</button>
          <h1>👤 마이페이지</h1>
        </header>
        <div className="mypage-loading"><div className="spinner" /><p>블록체인에서 데이터를 불러오는 중...</p></div>
      </div>
    );
  }

  return (
    <div className="mypage">
      <header className="mypage-header">
        <button className="mypage-back" onClick={onBack}>← 돌아가기</button>
        <h1>👤 마이페이지</h1>
        <span className="mypage-addr">{shorten(account)}</span>
      </header>

      {/* 탭 */}
      <div className="mypage-tabs">
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>📊 요약</button>
        <button className={tab === "nfts" ? "active" : ""} onClick={() => setTab("nfts")}>🎫 NFT 영수증</button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>📋 기부 내역</button>
        {myCampaigns.length > 0 && (
          <button className={tab === "milestones" ? "active" : ""} onClick={() => setTab("milestones")}>📊 마일스톤</button>
        )}
      </div>

      <main className="mypage-main">

        {/* ═══ 요약 ═══ */}
        {tab === "overview" && (
          <>
            <div className="overview-stats">
              <div className="overview-card primary">
                <div className="ov-icon">💰</div>
                <div className="ov-value">{formatETH(totalDonated)}</div>
                <div className="ov-label">총 기부액 (ETH)</div>
              </div>
              <div className="overview-card">
                <div className="ov-icon">🎫</div>
                <div className="ov-value">{myNFTs.length}</div>
                <div className="ov-label">NFT 영수증</div>
              </div>
              <div className="overview-card">
                <div className="ov-icon">📋</div>
                <div className="ov-value">{uniqueCampaigns}</div>
                <div className="ov-label">참여 캠페인</div>
              </div>
              <div className="overview-card">
                <div className="ov-icon">🏛</div>
                <div className="ov-value">{myCampaigns.length}</div>
                <div className="ov-label">내 캠페인</div>
              </div>
            </div>

            {/* 블록체인 데이터 안내 */}
            <div className="chain-notice">
              <div className="chain-icon">⛓️</div>
              <div>
                <h4>모든 데이터는 블록체인에서 직접 조회됩니다</h4>
                <p>위 정보는 Sepolia 테스트넷 스마트 컨트랙트에서 실시간으로 읽어온 데이터입니다. 누구나 컨트랙트 주소로 동일한 정보를 검증할 수 있습니다.</p>
              </div>
            </div>

            {/* 최근 기부 */}
            {myDonations.length > 0 && (
              <div className="recent-section">
                <h3>최근 기부</h3>
                {myDonations.slice(0, 3).map((d, i) => (
                  <div key={i} className="recent-item">
                    <div className="recent-left">
                      <span className="recent-campaign">{d.campaignTitle}</span>
                      <span className="recent-time">{new Date(Number(d.timestamp) * 1000).toLocaleDateString("ko-KR")}</span>
                    </div>
                    <span className="recent-amount">{formatETH(d.amount)} ETH</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══ NFT 영수증 ═══ */}
        {tab === "nfts" && (
          <>
            <div className="nft-header">
              <h2>🎫 나의 NFT 기부 영수증</h2>
              <p>기부할 때마다 발급된 ERC-721 NFT입니다. 블록체인에 영구 기록되어 위조가 불가능합니다.</p>
            </div>

            {myNFTs.length === 0 ? (
              <div className="mypage-empty">아직 기부한 내역이 없습니다. 기부하면 NFT 영수증이 자동 발급돼요!</div>
            ) : (
              <div className="nft-grid">
                {myNFTs.map((nft, i) => (
                  <div key={i} className="nft-card">
                    <div className="nft-visual">
                      <div className="nft-badge">NFT</div>
                      <div className="nft-id">#{nft.tokenId}</div>
                      <div className="nft-emoji">🎫</div>
                    </div>
                    <div className="nft-info">
                      <h4>Donation Receipt #{nft.tokenId}</h4>
                      <div className="nft-detail">
                        <span>캠페인</span>
                        <span>{nft.campaignTitle}</span>
                      </div>
                      <div className="nft-detail">
                        <span>기부액</span>
                        <span className="nft-amount">{formatETH(nft.amount)} ETH</span>
                      </div>
                      <div className="nft-detail">
                        <span>일시</span>
                        <span>{new Date(Number(nft.timestamp) * 1000).toLocaleDateString("ko-KR")}</span>
                      </div>
                      <div className="nft-detail">
                        <span>토큰 표준</span>
                        <span>ERC-721</span>
                      </div>
                      <a
                        href={`https://sepolia.etherscan.io/token/${contract.target}?a=${account}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="nft-etherscan"
                      >
                        🔗 Etherscan에서 확인
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {myNFTs.length > 0 && (
              <div className="chain-notice">
                <div className="chain-icon">🔐</div>
                <div>
                  <h4>NFT 영수증은 영구적입니다</h4>
                  <p>이 NFT는 당신의 지갑에 소유되어 있으며, 누구도 삭제하거나 위조할 수 없습니다. Etherscan에서 소유권을 직접 확인할 수 있습니다.</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ 기부 내역 ═══ */}
        {tab === "history" && (
          <>
            <div className="history-header">
              <h2>📋 전체 기부 내역</h2>
              <p>블록체인에 기록된 모든 기부 트랜잭션입니다.</p>
            </div>

            {myDonations.length === 0 ? (
              <div className="mypage-empty">아직 기부 내역이 없습니다.</div>
            ) : (
              <div className="history-list">
                {myDonations.map((d, i) => (
                  <div key={i} className="history-item">
                    <div className="history-left">
                      <div className="history-campaign">{d.campaignTitle}</div>
                      <div className="history-meta">
                        <span>NFT #{Number(d.nftTokenId)}</span>
                        <span>{new Date(Number(d.timestamp) * 1000).toLocaleString("ko-KR")}</span>
                      </div>
                      {d.message && <div className="history-msg">"{d.message}"</div>}
                    </div>
                    <div className="history-right">
                      <span className="history-amount">{formatETH(d.amount)} ETH</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="chain-notice">
              <div className="chain-icon">⛓️</div>
              <div>
                <h4>온체인 검증 가능</h4>
                <p>모든 기부는 Sepolia 블록체인의 이벤트 로그에 기록되어 있습니다. 트랜잭션 해시로 누구나 검증할 수 있습니다.</p>
              </div>
            </div>
          </>
        )}

        {/* ═══ 마일스톤 (기관용) ═══ */}
        {tab === "milestones" && (
          <>
            <div className="ms-header">
              <h2>📊 내 캠페인 마일스톤</h2>
              <p>단계별 자금 방출 현황입니다. 증빙을 제출해야 다음 단계 자금을 인출할 수 있습니다.</p>
            </div>

            {myCampaigns.map((c, idx) => {
              const cId = Number(c.id);
              const ms = milestonesData[cId];
              const raised = parseFloat(ethers.formatEther(c.raisedAmount));
              const goal = parseFloat(ethers.formatEther(c.goalAmount));
              const pctReached = goal > 0 ? (raised / goal) * 100 : 0;

              return (
                <div key={idx} className="ms-campaign">
                  <h3>#{cId} {c.title}</h3>
                  <div className="ms-progress-info">
                    <span>{formatETH(c.raisedAmount)} / {formatETH(c.goalAmount)} ETH</span>
                    <span>{pctReached.toFixed(1)}% 달성</span>
                  </div>

                  <div className="ms-timeline">
                    {msPercents.map((pct, mIdx) => {
                      const milestone = ms ? ms[mIdx] : null;
                      const reached = pctReached >= pct;
                      const evidenced = milestone?.evidenceSubmitted;
                      const claimed = milestone?.fundsClaimed;

                      return (
                        <div key={mIdx} className={`ms-step ${reached ? "reached" : ""} ${claimed ? "claimed" : ""}`}>
                          <div className="ms-dot">
                            {claimed ? "✅" : evidenced ? "📎" : reached ? "🟢" : "⬜"}
                          </div>
                          <div className="ms-step-info">
                            <div className="ms-step-title">{pct}% 마일스톤</div>
                            <div className="ms-step-status">
                              {claimed ? "인출 완료" : evidenced ? "증빙 제출됨 → 인출 가능" : reached ? "달성! 증빙 제출 필요" : "미달성"}
                            </div>
                            {milestone?.evidenceHash && (
                              <div className="ms-evidence-hash">
                                IPFS: {milestone.evidenceHash.startsWith("local_") ? "(로컬)" : milestone.evidenceHash.slice(0, 16) + "..."}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="chain-notice">
              <div className="chain-icon">🔒</div>
              <div>
                <h4>스마트 컨트랙트가 자금을 보호합니다</h4>
                <p>증빙 없이는 자금 인출이 불가능합니다. 컨트랙트 코드가 이 규칙을 자동으로 실행하며, 누구도 우회할 수 없습니다.</p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
