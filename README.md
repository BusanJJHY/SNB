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
