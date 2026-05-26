// IPFS 업로드 유틸리티 (Pinata 사용)
// 사용법: Pinata에서 API Key 발급 후 아래 값 입력
// https://app.pinata.cloud/developers/api-keys

const PINATA_API_KEY = "YOUR_PINATA_API_KEY";
const PINATA_SECRET = "YOUR_PINATA_SECRET_KEY";
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

/**
 * 파일을 IPFS에 업로드하고 CID를 반환
 * @param {File} file - 업로드할 파일
 * @returns {Promise<{cid: string, url: string}>}
 */
export async function uploadToIPFS(file) {
  if (PINATA_API_KEY === "YOUR_PINATA_API_KEY") {
    // Pinata 키 미설정 시 로컬 base64 폴백
    console.warn("Pinata API 키가 설정되지 않았습니다. 로컬 저장으로 폴백합니다.");
    return localFallback(file);
  }

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("pinataMetadata", JSON.stringify({
      name: `donation-evidence-${Date.now()}`,
    }));

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET,
      },
      body: formData,
    });

    if (!res.ok) throw new Error(`Pinata 업로드 실패: ${res.status}`);

    const data = await res.json();
    return {
      cid: data.IpfsHash,
      url: `${PINATA_GATEWAY}${data.IpfsHash}`,
      source: "ipfs",
    };
  } catch (err) {
    console.error("IPFS 업로드 실패, 로컬 폴백:", err);
    return localFallback(file);
  }
}

/**
 * JSON 데이터를 IPFS에 업로드 (NFT 메타데이터 등)
 */
export async function uploadJSONToIPFS(jsonData) {
  if (PINATA_API_KEY === "YOUR_PINATA_API_KEY") {
    return { cid: "local_" + Date.now(), url: "", source: "local" };
  }

  try {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET,
      },
      body: JSON.stringify({ pinataContent: jsonData }),
    });

    if (!res.ok) throw new Error(`Pinata JSON 업로드 실패: ${res.status}`);

    const data = await res.json();
    return {
      cid: data.IpfsHash,
      url: `${PINATA_GATEWAY}${data.IpfsHash}`,
      source: "ipfs",
    };
  } catch (err) {
    console.error("IPFS JSON 업로드 실패:", err);
    return { cid: "local_" + Date.now(), url: "", source: "local" };
  }
}

/**
 * IPFS CID로 파일 URL 생성
 */
export function getIPFSUrl(cid) {
  if (!cid || cid.startsWith("local_")) return null;
  return `${PINATA_GATEWAY}${cid}`;
}

/**
 * Pinata 연결 상태 확인
 */
export function isPinataConfigured() {
  return PINATA_API_KEY !== "YOUR_PINATA_API_KEY";
}

// 로컬 폴백 (base64)
async function localFallback(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve({
        cid: "local_" + Date.now(),
        url: e.target.result,
        source: "local",
      });
    };
    reader.readAsDataURL(file);
  });
}
