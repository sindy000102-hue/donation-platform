# 🟢 투명기부 플랫폼 (Transparent Donation)

블록체인 기반 투명 기부 플랫폼 — 모든 기부 내역이 온체인에 영구 기록됩니다.

## 📦 Tech Stack
- **Smart Contract**: Solidity 0.8.24 + OpenZeppelin
- **개발 환경**: Hardhat 2.x
- **프론트엔드**: React + ethers.js v6
- **테스트넷**: Sepolia
- **지갑**: MetaMask

---

## 🚀 로컬 세팅 방법

### 1단계: 의존성 설치
```bash
npm install
```

### 2단계: 환경변수 설정
```bash
cp .env.example .env
```
`.env` 파일을 열고 아래 값을 입력:
- `SEPOLIA_RPC_URL` → Alchemy 또는 Infura에서 Sepolia RPC URL 발급
- `PRIVATE_KEY` → MetaMask 지갑의 프라이빗 키

### 3단계: 컴파일
```bash
npx hardhat compile
```

### 4단계: 테스트
```bash
npx hardhat test
```

### 5단계: 로컬 배포 (테스트)
```bash
# 터미널 1: 로컬 노드 실행
npx hardhat node

# 터미널 2: 배포
npx hardhat run scripts/deploy.js --network localhost
```

### 6단계: Sepolia 배포
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

---

## 📁 폴더 구조
```
donation-platform/
├── contracts/
│   └── TransparentDonation.sol   # 스마트 컨트랙트
├── scripts/
│   └── deploy.js                 # 배포 스크립트
├── test/
│   └── TransparentDonation.test.js
├── frontend/                     # React 프론트엔드 (추후 세팅)
├── hardhat.config.js
├── .env.example
└── package.json
```

## 📝 스마트 컨트랙트 기능
| 함수 | 설명 |
|------|------|
| `createCampaign()` | 새 기부 캠페인 생성 |
| `donate()` | 캠페인에 ETH 기부 |
| `withdraw()` | 마감 후 모금액 인출 (생성자만) |
| `getCampaign()` | 캠페인 정보 조회 |
| `getDonations()` | 기부 내역 조회 |
