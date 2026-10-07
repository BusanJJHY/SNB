# 점프!

설치 없이 실행하는 작은 점프게임입니다. 스페이스바, 위쪽 방향키 또는 화면 터치로 장애물을 넘으세요. 최고 점수는 브라우저에 저장됩니다.

## 로컬 실행

```sh
cd /workspace/SNB
python3 -m http.server 8000 --bind 0.0.0.0
```

브라우저로 접속하거나 `index.html`을 직접 열면 됩니다. 별도 패키지나 비밀키가 필요하지 않습니다.

## GitHub Pages

저장소 Settings → Pages → Build and deployment → Source에서 **GitHub Actions**를 선택합니다. `main`에 푸시하거나 Actions에서 Publish jump game을 실행하면 배포됩니다.

## 추가 게임

- `/racing/`: 좌우 이동 레이싱게임, 코인 상점과 폭탄 아이템
- `/rhythm/`: 4레인 리듬게임. D/F/J/K 또는 터치 패드로 플레이합니다.

리듬게임은 Web Audio로 자체 제작한 48초 곡을 연주합니다. 외부 음원이나 샘플, 별도 설치는 필요하지 않습니다. 음악은 시작 버튼을 누른 뒤 재생됩니다. 음악의 이용 조건은 `rhythm/README.md`를 확인하세요.
