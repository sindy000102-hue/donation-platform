import { useState, useEffect, useMemo } from "react";
import "./Community.css";
import { DisplayName } from "./Profile";
import "./Profile.css";

const HASHTAGS = [
  { tag: "고아원", emoji: "👶" },
  { tag: "유기동물", emoji: "🐾" },
  { tag: "참전용사", emoji: "🎖️" },
  { tag: "노인복지", emoji: "👴" },
  { tag: "환경보호", emoji: "🌿" },
  { tag: "교육지원", emoji: "📚" },
  { tag: "의료지원", emoji: "🏥" },
  { tag: "재난구호", emoji: "🆘" },
  { tag: "장애인복지", emoji: "♿" },
  { tag: "다문화", emoji: "🌍" },
];

const POSTS_KEY = "community_posts";
const USAGE_KEY = "usage_posts";
const VOTES_KEY = "community_votes";
const REPORTS_KEY = "community_reports";
const BANNED_KEY = "banned_orgs";

const shorten = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

const get12hCycle = () => {
  const now = Date.now();
  return Math.floor((now + 9 * 3600000) / (12 * 3600000));
};

const getPrev12hRange = () => {
  const now = Date.now();
  const ko = now + 9 * 3600000;
  const cs = Math.floor(ko / (12 * 3600000)) * (12 * 3600000);
  return { start: cs - 12 * 3600000 - 9 * 3600000, end: cs - 9 * 3600000 };
};

export default function Community({ account, role, onBack, allDonationList }) {
  const [board, setBoard] = useState("request"); // "request" | "usage" | "ranking"
  const [posts, setPosts] = useState([]);
  const [usagePosts, setUsagePosts] = useState([]);
  const [votes, setVotes] = useState({});
  const [reports, setReports] = useState({});
  const [bannedOrgs, setBannedOrgs] = useState([]);

  const [showWrite, setShowWrite] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState(null);
  const [viewMode, setViewMode] = useState("latest");

  // 글쓰기 폼
  const [form, setForm] = useState({ title: "", orgName: "", content: "", hashtags: [], campaignPlan: "" });
  const [postImagePreviews, setPostImagePreviews] = useState([]);

  const [commentText, setCommentText] = useState("");
  const COMMENTS_KEY = "post_comments";

  const getComments = (postId) => {
    try { const c = JSON.parse(localStorage.getItem(COMMENTS_KEY) || "{}"); return c[postId] || []; } catch { return []; }
  };

  const handleComment = (postId) => {
    if (!account) return alert("지갑을 먼저 연결해주세요");
    if (!commentText.trim()) return alert("댓글을 입력해주세요");
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY) || "{}");
    if (!all[postId]) all[postId] = [];
    all[postId].push({ author: account, text: commentText, createdAt: Date.now() });
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
    setCommentText("");
  };

  // 신고 모달
  const [showReport, setShowReport] = useState(null);
  const [reportReason, setReportReason] = useState("");

  useEffect(() => {
    try {
      const s1 = localStorage.getItem(POSTS_KEY); if (s1) setPosts(JSON.parse(s1));
      const s2 = localStorage.getItem(USAGE_KEY); if (s2) setUsagePosts(JSON.parse(s2));
      const s3 = localStorage.getItem(VOTES_KEY); if (s3) setVotes(JSON.parse(s3));
      const s4 = localStorage.getItem(REPORTS_KEY); if (s4) setReports(JSON.parse(s4));
      const s5 = localStorage.getItem(BANNED_KEY); if (s5) setBannedOrgs(JSON.parse(s5));
    } catch {}
  }, []);

  const save = (key, data, setter) => { setter(data); localStorage.setItem(key, JSON.stringify(data)); };

  // ── 이미지 ──
  const handleAddImage = (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert("5MB 이하만 가능");
    if (postImagePreviews.length >= 5) return alert("최대 5장");
    const reader = new FileReader();
    reader.onload = (ev) => setPostImagePreviews([...postImagePreviews, ev.target.result]);
    reader.readAsDataURL(file);
  };

  const toggleHashtag = (tag) => {
    setForm((p) => ({
      ...p, hashtags: p.hashtags.includes(tag) ? p.hashtags.filter((t) => t !== tag)
        : p.hashtags.length < 3 ? [...p.hashtags, tag] : p.hashtags,
    }));
  };

  // ── 글 작성 ──
  const handleSubmit = () => {
    if (!form.title.trim() || !form.orgName.trim() || !form.content.trim()) return alert("필수 항목을 입력해주세요");
    if (bannedOrgs.includes(account?.toLowerCase())) return alert("이용이 정지된 계정입니다");
    if (board === "request" && form.hashtags.length === 0) return alert("해시태그 1개 이상 선택");

    const newPost = {
      id: Date.now().toString(), author: account || "0x0000", orgName: form.orgName,
      title: form.title, content: form.content, campaignPlan: form.campaignPlan,
      hashtags: form.hashtags, images: postImagePreviews, createdAt: Date.now(), votes: {},
    };

    if (board === "request") {
      save(POSTS_KEY, [newPost, ...posts], setPosts);
    } else {
      save(USAGE_KEY, [newPost, ...usagePosts], setUsagePosts);
    }
    setForm({ title: "", orgName: "", content: "", hashtags: [], campaignPlan: "" });
    setPostImagePreviews([]); setShowWrite(false);
  };

  // ── 추천 ──
  const handleVote = (postId, isUsage) => {
    if (!account) return alert("지갑을 먼저 연결해주세요");
    const target = isUsage ? usagePosts : posts;
    const post = target.find((p) => p.id === postId);
    if (post && post.author.toLowerCase() === account.toLowerCase()) return alert("본인 게시글은 추천할 수 없습니다");
    const cycle = get12hCycle();
    const voteKey = `${postId}_${account}_${cycle}`;
    if (votes[voteKey]) return alert("이번 주기에 이미 추천했습니다");
    const updated = target.map((p) => {
      if (p.id === postId) {
        const nv = { ...p.votes }; nv[`${account}_${cycle}`] = Date.now();
        return { ...p, votes: nv };
      }
      return p;
    });
    if (isUsage) save(USAGE_KEY, updated, setUsagePosts);
    else save(POSTS_KEY, updated, setPosts);
    save(VOTES_KEY, { ...votes, [voteKey]: true }, setVotes);
  };

  // ── 신고 ──
  const handleReport = () => {
    if (!reportReason.trim()) return alert("신고 사유를 입력해주세요");
    const targetAddr = showReport.author.toLowerCase();
    const newReports = { ...reports };
    if (!newReports[targetAddr]) newReports[targetAddr] = [];
    newReports[targetAddr].push({ reporter: account, reason: reportReason, date: Date.now(), postId: showReport.id });
    save(REPORTS_KEY, newReports, setReports);

    // 신고 5회 이상 → 이용정지
    if (newReports[targetAddr].length >= 5 && !bannedOrgs.includes(targetAddr)) {
      const newBanned = [...bannedOrgs, targetAddr];
      save(BANNED_KEY, newBanned, setBannedOrgs);
      alert(`⚠️ 해당 기관(${shorten(showReport.author)})이 누적 신고로 이용 정지되었습니다.`);
    } else {
      alert(`신고가 접수되었습니다. (누적 ${newReports[targetAddr].length}/5)`);
    }
    setShowReport(null); setReportReason("");
  };

  const getReportCount = (addr) => (reports[addr?.toLowerCase()] || []).length;
  const isBanned = (addr) => bannedOrgs.includes(addr?.toLowerCase());
  const getTotalVotes = (post) => post.votes ? Object.keys(post.votes).length : 0;
  const getPrevVotes = (post) => {
    if (!post.votes) return 0;
    const { start, end } = getPrev12hRange();
    return Object.values(post.votes).filter((t) => t >= start && t < end).length;
  };

  // ── 필터링 ──
  const currentPosts = board === "usage" ? usagePosts : posts;
  const filtered = useMemo(() => {
    let r = [...currentPosts];
    if (selectedTag) r = r.filter((p) => p.hashtags.includes(selectedTag));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter((p) => p.title.toLowerCase().includes(q) || p.orgName.toLowerCase().includes(q) || p.hashtags.some((t) => t.includes(q)));
    }
    if (viewMode === "trending") r.sort((a, b) => getPrevVotes(b) - getPrevVotes(a));
    else r.sort((a, b) => b.createdAt - a.createdAt);
    return r;
  }, [currentPosts, selectedTag, searchQuery, viewMode]);

  const trendingIds = useMemo(() => {
    return [...currentPosts].sort((a, b) => getPrevVotes(b) - getPrevVotes(a))
      .slice(0, 3).filter((p) => getPrevVotes(p) > 0).map((p) => p.id);
  }, [currentPosts]);

  // ── 모범사례 랭킹 ──
  const orgRankings = useMemo(() => {
    const orgMap = {};
    usagePosts.forEach((p) => {
      const key = p.orgName;
      if (!orgMap[key]) orgMap[key] = { orgName: key, author: p.author, totalVotes: 0, postCount: 0, bestCount: 0 };
      orgMap[key].totalVotes += getTotalVotes(p);
      orgMap[key].postCount++;
    });
    // 인기글 선정 횟수
    const allTrending = [...usagePosts].sort((a, b) => getTotalVotes(b) - getTotalVotes(a)).slice(0, 5);
    allTrending.forEach((p) => { if (orgMap[p.orgName]) orgMap[p.orgName].bestCount++; });
    return Object.values(orgMap).sort((a, b) => b.totalVotes - a.totalVotes);
  }, [usagePosts]);

  // ════ 글 상세 ════
  if (selectedPost) {
    const isUsage = board === "usage";
    const isTrending = trendingIds.includes(selectedPost.id);
    const banned = isBanned(selectedPost.author);
    return (
      <div className="comm-app">
        <header className="comm-header">
          <button className="comm-back" onClick={() => setSelectedPost(null)}>← 목록</button>
          <h1>{isUsage ? "📊 사용내역" : "📋 게시판"}</h1>
        </header>
        <main className="comm-main">
          <article className="post-detail">
            {banned && <div className="banned-label">🚫 이용정지 기관</div>}
            {isTrending && <div className="trending-label">🔥 인기 게시글</div>}
            <div className="post-detail-tags">
              {selectedPost.hashtags.map((t) => <span key={t} className="tag">#{t}</span>)}
            </div>
            <h2 className="post-detail-title">{selectedPost.title}</h2>
            <div className="post-detail-meta">
              <span className="org-name">🏛 {selectedPost.orgName}</span>
              <DisplayName address={selectedPost.author} allDonations={allDonationList || []} />
              <span>{new Date(selectedPost.createdAt).toLocaleDateString("ko-KR")}</span>
              {getReportCount(selectedPost.author) > 0 && (
                <span className="report-count">⚠️ 신고 {getReportCount(selectedPost.author)}회</span>
              )}
            </div>
            {selectedPost.images?.length > 0 && (
              <div className="post-detail-images">
                {selectedPost.images.map((img, i) => <img key={i} src={img} alt="" />)}
              </div>
            )}
            <div className="post-detail-content">
              <h3>{isUsage ? "📊 기부금 사용 내역" : "📝 기부가 필요한 이유"}</h3>
              <p>{selectedPost.content}</p>
            </div>
            {selectedPost.campaignPlan && (
              <div className="post-detail-plan">
                <h3>📋 {isUsage ? "상세 내역" : "기부금 사용 계획"}</h3>
                <p>{selectedPost.campaignPlan}</p>
              </div>
            )}
            <div className="post-actions">
              <button className="vote-btn large" onClick={() => handleVote(selectedPost.id, isUsage)}>
                👍 추천 ({getTotalVotes(selectedPost)})
              </button>
              {account && selectedPost.author.toLowerCase() !== account.toLowerCase() && (
                <button className="report-btn" onClick={() => setShowReport(selectedPost)}>🚨 신고</button>
              )}
            </div>

            {/* 댓글 (사용내역 게시판에서만) */}
            {isUsage && (
              <div className="comments-section">
                <h3>💬 댓글 ({getComments(selectedPost.id).length})</h3>
                {account && (
                  <div className="comment-input-area">
                    <input placeholder="댓글을 입력하세요..." value={commentText} onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleComment(selectedPost.id); }} />
                    <button className="comment-submit" onClick={() => handleComment(selectedPost.id)}>등록</button>
                  </div>
                )}
                {getComments(selectedPost.id).length === 0 ? (
                  <div className="comment-empty">아직 댓글이 없습니다. 첫 댓글을 남겨보세요!</div>
                ) : (
                  <div className="comment-list">
                    {getComments(selectedPost.id).map((c, i) => (
                      <div key={i} className="comment-item">
                        <div className="comment-meta">
                          <span className="comment-author">
                            <DisplayName address={c.author} allDonations={allDonationList || []} />
                          </span>
                          <span className="comment-date">{new Date(c.createdAt).toLocaleString("ko-KR")}</span>
                        </div>
                        <div className="comment-text">{c.text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </article>
        </main>
        {/* 신고 모달 */}
        {showReport && (
          <div className="comm-modal" onClick={(e) => e.target === e.currentTarget && setShowReport(null)}>
            <div className="comm-modal-box small">
              <h2>🚨 신고하기</h2>
              <p className="write-hint">기관: {showReport.orgName} ({shorten(showReport.author)})</p>
              <label>신고 사유</label>
              <textarea placeholder="허위 모금, 기부금 횡령, 부풀린 내용 등 사유를 작성해주세요" value={reportReason} onChange={(e) => setReportReason(e.target.value)} rows={3} />
              <button className="report-submit" onClick={handleReport}>신고 접수</button>
              <button className="comm-cancel" onClick={() => { setShowReport(null); setReportReason(""); }}>취소</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════ 메인 ════
  return (
    <div className="comm-app">
      <header className="comm-header">
        <div className="comm-header-left">
          <button className="comm-back" onClick={onBack}>← 돌아가기</button>
          <h1>📋 커뮤니티</h1>
        </div>
        {role === "org" && account && !isBanned(account) && (
          <button className="write-btn" onClick={() => setShowWrite(true)}>✍️ 글쓰기</button>
        )}
      </header>

      <main className="comm-main">
        {/* 보드 탭 */}
        <div className="board-tabs">
          <button className={board === "request" ? "active" : ""} onClick={() => { setBoard("request"); setSelectedPost(null); }}>📋 기부요청</button>
          <button className={board === "usage" ? "active" : ""} onClick={() => { setBoard("usage"); setSelectedPost(null); }}>📊 사용내역</button>
          <button className={board === "ranking" ? "active" : ""} onClick={() => { setBoard("ranking"); setSelectedPost(null); }}>🏆 랭킹</button>
        </div>

        {/* ── 랭킹 탭 ── */}
        {board === "ranking" ? (
          <div className="ranking-section">
            <h2 className="ranking-title">🏆 모범사례 기관 랭킹</h2>
            <p className="ranking-sub">사용내역 게시판에서 추천을 많이 받은 신뢰도 높은 기관입니다.</p>
            {orgRankings.length === 0 ? (
              <div className="comm-empty">아직 랭킹 데이터가 없습니다</div>
            ) : (
              <div className="ranking-list">
                {orgRankings.map((org, i) => (
                  <div key={i} className={`ranking-card ${i < 3 ? `top-${i + 1}` : ""}`}>
                    <div className="rank-num">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                    </div>
                    <div className="rank-info">
                      <h4>{org.orgName}</h4>
                      <div className="rank-meta">
                        <DisplayName address={org.author} allDonations={allDonationList || []} />
                        <span>게시글 {org.postCount}건</span>
                        <span>모범사례 {org.bestCount}회</span>
                      </div>
                    </div>
                    <div className="rank-votes">
                      <span className="rank-vote-num">{org.totalVotes}</span>
                      <span className="rank-vote-label">추천</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 기부자 왕관 안내 */}
            <div className="crown-guide">
              <h3>👑 기부자 등급 안내</h3>
              <div className="crown-levels">
                <div className="crown-level"><span className="crown-icon crown-gold">👑</span> 상위 10% — 골드</div>
                <div className="crown-level"><span className="crown-icon crown-silver">🥈</span> 상위 20% — 실버</div>
                <div className="crown-level"><span className="crown-icon crown-bronze">🥉</span> 상위 30% — 브론즈</div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 검색 */}
            <div className="search-bar">
              <input placeholder="제목, 기관명, 해시태그로 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            {board === "request" && (
              <div className="tag-filter">
                <button className={`tag-btn ${!selectedTag ? "active" : ""}`} onClick={() => setSelectedTag(null)}>전체</button>
                {HASHTAGS.map(({ tag, emoji }) => (
                  <button key={tag} className={`tag-btn ${selectedTag === tag ? "active" : ""}`} onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}>{emoji} {tag}</button>
                ))}
              </div>
            )}
            <div className="sort-tabs">
              <button className={viewMode === "latest" ? "active" : ""} onClick={() => setViewMode("latest")}>🕐 최신순</button>
              <button className={viewMode === "trending" ? "active" : ""} onClick={() => setViewMode("trending")}>🔥 인기순</button>
            </div>
            {/* 게시글 목록 */}
            {filtered.length === 0 ? (
              <div className="comm-empty">{searchQuery || selectedTag ? "검색 결과가 없습니다" : "아직 게시글이 없습니다"}</div>
            ) : (
              <div className="post-list">
                {filtered.map((post) => {
                  const isTrending = trendingIds.includes(post.id);
                  const banned = isBanned(post.author);
                  return (
                    <div key={post.id} className={`post-card ${isTrending ? "trending" : ""} ${banned ? "banned" : ""}`} onClick={() => setSelectedPost(post)}>
                      {isTrending && <div className="trending-badge">🔥 인기</div>}
                      {banned && <div className="banned-badge">🚫 정지</div>}
                      <div className="post-card-left">
                        {post.images?.length > 0 ? (
                          <img src={post.images[0]} alt="" className="post-thumb" />
                        ) : (
                          <div className="post-thumb-placeholder">{HASHTAGS.find((h) => h.tag === post.hashtags[0])?.emoji || (board === "usage" ? "📊" : "📝")}</div>
                        )}
                      </div>
                      <div className="post-card-body">
                        <div className="post-card-tags">
                          {post.hashtags.map((t) => <span key={t} className="tag small">#{t}</span>)}
                        </div>
                        <h3 className="post-card-title">{post.title}</h3>
                        <div className="post-card-meta">
                          <span className="org-name">🏛 {post.orgName}</span>
                          <DisplayName address={post.author} allDonations={allDonationList || []} />
                        </div>
                        <p className="post-card-preview">{post.content}</p>
                      </div>
                      <div className="post-card-right">
                        <button className="vote-btn" onClick={(e) => { e.stopPropagation(); handleVote(post.id, board === "usage"); }}>
                          👍<span>{getTotalVotes(post)}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* 글쓰기 모달 */}
      {showWrite && (
        <div className="comm-modal" onClick={(e) => e.target === e.currentTarget && setShowWrite(false)}>
          <div className="comm-modal-box">
            <h2>{board === "usage" ? "📊 사용내역 작성" : "✍️ 게시글 작성"}</h2>
            <p className="write-hint">{board === "usage" ? "기부금을 어떻게 사용했는지 투명하게 공개해주세요." : "기부가 필요한 이유와 사용 계획을 작성해주세요."}</p>
            <label>기관명</label>
            <input placeholder="기관명" value={form.orgName} onChange={(e) => setForm({ ...form, orgName: e.target.value })} />
            <label>제목</label>
            <input placeholder="제목" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            {board === "request" && (
              <>
                <label>해시태그 (최대 3개)</label>
                <div className="hashtag-select">
                  {HASHTAGS.map(({ tag, emoji }) => (
                    <button key={tag} className={`ht-btn ${form.hashtags.includes(tag) ? "selected" : ""}`} onClick={() => toggleHashtag(tag)}>{emoji} {tag}</button>
                  ))}
                </div>
              </>
            )}
            <label>{board === "usage" ? "📎 증빙자료 (영수증, 사진 등 최대 5장)" : "사진 (최대 5장)"}</label>
            <div className="image-upload-area">
              {postImagePreviews.map((img, i) => (
                <div key={i} className="upload-thumb">
                  <img src={img} alt="" />
                  <button className="remove-img" onClick={() => setPostImagePreviews(postImagePreviews.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              {postImagePreviews.length < 5 && (
                <label className="add-image-btn">📷<input type="file" accept="image/*" onChange={handleAddImage} hidden /></label>
              )}
            </div>
            <label>{board === "usage" ? "사용 내역" : "기부가 필요한 이유"}</label>
            <textarea placeholder={board === "usage" ? "기부금을 어떻게 사용했는지 상세히 작성" : "현재 상황과 기부가 필요한 이유"} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} />
            <label>{board === "usage" ? "영수증/증빙 설명" : "기부금 사용 계획"}</label>
            <textarea placeholder="상세 내역" value={form.campaignPlan} onChange={(e) => setForm({ ...form, campaignPlan: e.target.value })} rows={4} />
            <button className="comm-submit" onClick={handleSubmit}>등록</button>
            <button className="comm-cancel" onClick={() => setShowWrite(false)}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}
