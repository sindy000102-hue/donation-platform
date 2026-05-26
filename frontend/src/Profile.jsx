import { useState, useEffect } from "react";
import "./Profile.css";

const PROFILES_KEY = "user_profiles";
const ORG_APPS_KEY = "org_applications";

export function getProfile(address) {
  if (!address) return null;
  try {
    const data = JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}");
    return data[address.toLowerCase()] || null;
  } catch { return null; }
}

export function getAllProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}"); } catch { return {}; }
}

export function DisplayName({ address, allDonations, showCrown = true }) {
  const profile = getProfile(address);
  const crown = showCrown ? getDonorCrownFromList(address, allDonations) : null;
  const shorten = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "";

  if (profile?.role === "org") {
    const orgBadge = getOrgBadge(profile.orgName);
    return (
      <span className="display-name org">
        {orgBadge && <span className={`org-badge ${orgBadge.cls}`} title={orgBadge.label}>{orgBadge.icon}</span>}
        🏛 {profile.orgName}
      </span>
    );
  }

  return (
    <span className="display-name donor">
      {crown && <span className={`crown-icon ${crown.cls}`} title={crown.label}>{crown.crown}</span>}
      {profile?.nickname || shorten(address)}
    </span>
  );
}

// 기부자 왕관
export function getDonorCrownFromList(address, allDonations) {
  if (!address || !allDonations || allDonations.length === 0) return null;
  const totals = {};
  allDonations.forEach((d) => {
    const addr = (d.donor || d.author || "").toLowerCase();
    totals[addr] = (totals[addr] || 0) + 1;
  });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const idx = sorted.findIndex(([a]) => a === address.toLowerCase());
  if (idx === -1) return null;
  const pct = ((idx + 1) / sorted.length) * 100;
  if (pct <= 10) return { crown: "👑", label: "골드 기부자", cls: "crown-gold" };
  if (pct <= 20) return { crown: "🥈", label: "실버 기부자", cls: "crown-silver" };
  if (pct <= 30) return { crown: "🥉", label: "브론즈 기부자", cls: "crown-bronze" };
  return null;
}

// 기관 등급
export function getOrgBadge(orgName) {
  if (!orgName) return null;
  try {
    const usagePosts = JSON.parse(localStorage.getItem("usage_posts") || "[]");
    const orgPosts = usagePosts.filter((p) => p.orgName === orgName);
    if (orgPosts.length === 0) return null;

    const totalVotes = orgPosts.reduce((sum, p) => sum + Object.keys(p.votes || {}).length, 0);

    // 전체 기관 순위 계산
    const allOrgs = {};
    usagePosts.forEach((p) => {
      if (!allOrgs[p.orgName]) allOrgs[p.orgName] = 0;
      allOrgs[p.orgName] += Object.keys(p.votes || {}).length;
    });
    const sorted = Object.entries(allOrgs).sort((a, b) => b[1] - a[1]);
    const idx = sorted.findIndex(([name]) => name === orgName);
    if (idx === -1 || totalVotes === 0) return null;

    const pct = ((idx + 1) / sorted.length) * 100;
    if (pct <= 10 || idx === 0) return { icon: "👑", label: "우수 기관 (골드)", cls: "org-gold" };
    if (pct <= 25 || idx === 1) return { icon: "🥈", label: "우수 기관 (실버)", cls: "org-silver" };
    if (pct <= 40 || idx === 2) return { icon: "🥉", label: "우수 기관 (브론즈)", cls: "org-bronze" };
    return null;
  } catch { return null; }
}

// ══════════════════════
// 프로필 설정 모달
// ══════════════════════
export function ProfileSetup({ account, onClose, onSave }) {
  const [existing, setExisting] = useState(null);
  const [profileRole, setProfileRole] = useState("donor");
  const [nickname, setNickname] = useState("");
  const [orgForm, setOrgForm] = useState({
    orgName: "", representative: "", address: "", phone: "",
    affiliation: "", registrationNumber: "", description: "",
  });

  useEffect(() => {
    const p = getProfile(account);
    if (p) {
      setExisting(p);
      setProfileRole(p.role);
      if (p.role === "donor") setNickname(p.nickname || "");
      else setOrgForm({ orgName: p.orgName || "", representative: p.representative || "", address: p.address || "", phone: p.phone || "", affiliation: p.affiliation || "", registrationNumber: p.registrationNumber || "", description: p.description || "" });
    }
  }, [account]);

  const handleSave = () => {
    if (profileRole === "donor") {
      if (!nickname.trim()) return alert("닉네임을 입력해주세요");
      if (nickname.length > 20) return alert("닉네임은 20자 이내로 입력해주세요");
    } else {
      if (!orgForm.orgName.trim()) return alert("기관명을 입력해주세요");
      if (!orgForm.representative.trim()) return alert("대표자명을 입력해주세요");
      if (!orgForm.address.trim()) return alert("기관 주소를 입력해주세요");
      if (!orgForm.phone.trim()) return alert("연락처를 입력해주세요");
      if (!orgForm.registrationNumber.trim()) return alert("사업자등록번호를 입력해주세요");
    }

    const profiles = getAllProfiles();
    if (profileRole === "donor") {
      profiles[account.toLowerCase()] = { role: "donor", nickname, address: account, createdAt: Date.now() };
    } else {
      profiles[account.toLowerCase()] = {
        role: "org", ...orgForm, walletAddress: account, createdAt: Date.now(), verified: false,
      };
      // 기관 가입 신청 기록
      const apps = JSON.parse(localStorage.getItem(ORG_APPS_KEY) || "[]");
      apps.push({ ...orgForm, walletAddress: account, appliedAt: Date.now(), status: "pending" });
      localStorage.setItem(ORG_APPS_KEY, JSON.stringify(apps));
    }
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    if (onSave) onSave(profiles[account.toLowerCase()]);
    onClose();
  };

  return (
    <div className="profile-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="profile-box">
        <h2>👤 프로필 설정</h2>

        <div className="profile-role-select">
          <button className={profileRole === "donor" ? "active" : ""} onClick={() => setProfileRole("donor")}>💚 기부자</button>
          <button className={profileRole === "org" ? "active" : ""} onClick={() => setProfileRole("org")}>🏛 기관</button>
        </div>

        {profileRole === "donor" ? (
          <>
            <label>닉네임</label>
            <input placeholder="다른 사용자에게 보여질 닉네임" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} />
            <p className="profile-hint">기부할 때 지갑 주소 대신 닉네임이 표시됩니다.</p>
          </>
        ) : (
          <>
            <p className="profile-warning">⚠️ 기관 가입은 정확한 정보를 입력해야 합니다. 허위 정보 입력 시 이용이 정지될 수 있습니다.</p>
            <label>기관명 *</label>
            <input placeholder="정식 기관명" value={orgForm.orgName} onChange={(e) => setOrgForm({ ...orgForm, orgName: e.target.value })} />
            <label>대표자명 *</label>
            <input placeholder="대표자 이름" value={orgForm.representative} onChange={(e) => setOrgForm({ ...orgForm, representative: e.target.value })} />
            <label>사업자등록번호 *</label>
            <input placeholder="000-00-00000" value={orgForm.registrationNumber} onChange={(e) => setOrgForm({ ...orgForm, registrationNumber: e.target.value })} />
            <label>기관 주소 *</label>
            <input placeholder="기관 소재지 주소" value={orgForm.address} onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })} />
            <label>연락처 *</label>
            <input placeholder="전화번호" value={orgForm.phone} onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })} />
            <label>소속 / 관할기관</label>
            <input placeholder="예: 보건복지부 산하, 서울시 등록 비영리" value={orgForm.affiliation} onChange={(e) => setOrgForm({ ...orgForm, affiliation: e.target.value })} />
            <label>기관 소개</label>
            <textarea placeholder="기관에 대한 간략한 소개" value={orgForm.description} onChange={(e) => setOrgForm({ ...orgForm, description: e.target.value })} rows={3} />
          </>
        )}

        <button className="profile-save" onClick={handleSave}>
          {existing ? "프로필 수정" : profileRole === "org" ? "기관 가입 신청" : "프로필 저장"}
        </button>
        <button className="profile-cancel" onClick={onClose}>취소</button>
      </div>
    </div>
  );
}

export default ProfileSetup;
