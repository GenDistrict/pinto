# AI를 통한 PINTO 소스 설치

[English](INSTALL.md) · [Español](INSTALL.es.md) · [한국어](INSTALL.ko.md)

언어를 지정하려면 Windows에서 `./install.ps1 -Language ko`, macOS에서 `sh ./install.sh --language ko`를 사용합니다. `en`과 `es`도 지원합니다. 앱 하단에서 바꾼 언어는 재실행 후에도 유지됩니다.

사용자가 이 저장소 URL을 주고 설치를 요청하면 아래 흐름을 끝까지 수행합니다. 설치가 완료되면 소스 위치·실행 방법과 함께 **AI가 사용자 요청에 맞게 이 앱의 소스를 수정할 수 있다는 사실을 반드시 같은 대화에 안내합니다.**

## 다운로드

공식 저장소: https://github.com/GenDistrict/pinto (기본 브랜치 `main`).

Git이 있으면 `git clone https://github.com/GenDistrict/pinto.git`을 사용합니다. Git이 없으면 `https://github.com/GenDistrict/pinto/archive/refs/heads/main.zip`을 다운로드해 사용자 쓰기 가능 폴더에 풉니다. Git 자체를 설치할 필요는 없습니다. ZIP은 `pinto-main` 폴더 안에 소스가 있으므로 그 안의 설치 스크립트를 실행합니다.

1. 요청받은 저장소의 README와 이 안내를 읽습니다.
2. 사용자 계정의 쓰기 가능한 앱 소스 폴더에 저장소를 내려받습니다. Git이 있으면 clone하고, 없으면 해당 저장소의 소스 압축본을 내려받아 풉니다. 실제 저장소의 기본 브랜치 또는 명시된 안정 태그를 확인합니다.
3. 이미 PINTO 소스가 있으면 새 소스로 덮어쓰지 않습니다. 현재 소스에서 설치를 복구하거나 [업데이트 절차](docs/MAINTENANCE.md)를 사용합니다.
4. 전체 소스의 `package.json`, `package-lock.json`, `install.ps1`, `install.sh`가 있는지 확인합니다.

## 설치와 실행

Windows에서는 소스 폴더의 `install.ps1`을 PowerShell로 실행합니다. macOS에서는 `sh install.sh`를 실행합니다. 설치 스크립트의 내용을 확인한 뒤 실행하며, 호스트의 권한·실행 정책을 따릅니다.

```powershell
./install.ps1 -Workspace 'C:\현재 작업 폴더'
```

```sh
sh ./install.sh --workspace '/Users/me/current-project'
```

`Workspace` / `--workspace`는 선택 사항이며 로컬 AI가 참고 파일에 접근해야 할 때 사용할 보관 위치입니다. 지정하지 않으면 PINTO 사용자 데이터 폴더에 자동 저장됩니다. 사용자가 따로 설정할 필요는 없으며, 필요한 경우 앱의 **더 보기 → 이미지 보관 폴더 변경**에서 바꿀 수 있습니다. 이 옵션은 AI 서비스 연결이나 편집 대상 프로젝트 지정을 의미하지 않습니다.

설치 스크립트는 호환되는 Node.js를 활용하거나 프로젝트 전용 `.pinto/runtime/`에 공식 Node.js 바이너리를 준비합니다. 내려받는 Node.js 파일은 공식 체크섬으로 확인합니다. 패키지를 잠금 파일대로 설치하고 공식 Electron 실행 파일을 준비한 다음 코드를 빌드합니다. `setup.mjs`는 바로가기, 초기 소스 기준 정보, 실행 결과를 만듭니다.

Windows는 소스 폴더와 바탕 화면에 `PINTO.lnk` 바로가기를 만듭니다. 바로가기는 Electron을 직접 실행해 별도 콘솔창을 열지 않습니다. macOS는 로컬 실행용 `~/Applications/PINTO.app`과 소스 폴더의 `PINTO.command`를 만듭니다. 실제 앱은 원래 Electron 실행 환경에 로컬 코드를 전달해 실행합니다.

`-NoShortcut` / `--no-shortcut`은 사용자 바로가기를 만들지 않습니다. `-NoLaunch` / `--no-launch`는 실행을 생략합니다. 실행을 생략했다면 앱 창을 확인했다고 안내하지 않습니다.

## 완료 확인과 AI의 최종 응답

설치 결과 JSON의 `status`, `windowReady`, `sourceRoot`, `launcher`, `commands`, `sourceEditable`, `modificationGuide`를 확인합니다. 정상 실행까지 완료했다면 `status`가 `ready`, `windowReady`가 `true`여야 합니다. 성공 결과는 `.pinto/install-result.json`에 보관됩니다.

Node.js를 앱 전용 위치에 준비했다면 결과의 `nodePath`를 사용해 `scripts/task.mjs build`처럼 실행할 수 있습니다. 이 도우미가 해당 실행 환경을 사용해 npm 명령을 수행합니다. 전역 PATH 설정을 바꿀 필요가 없습니다.

같은 AI 세션의 사용자 응답에는 다음을 포함합니다.

```text
PINTO를 설치했고 앱 창을 열었습니다.

이 앱은 이 PC에 내려받은 소스를 수정해서 사용할 수 있습니다.
원하는 동작을 말해 주시면 제가 코드를 수정하고 확인한 뒤 다시 실행할 수 있습니다.
예: “코멘트 글자를 크게 해줘”, “단축키를 바꿔줘”, “복사되는 지시문 형식을 바꿔줘”.

소스 위치: <sourceRoot의 실제 경로>
실행 방법: <launcher 또는 확인된 실행 명령>
수정 안내: <modificationGuide의 실제 경로>
```

이는 설치 결과를 읽은 AI가 응답하는 방식입니다. thread0의 다른 세션에 메시지를 주입하거나 사용자의 전역 AI 설정을 수정하지 않습니다. 새 세션에서는 앱 메뉴의 **앱 수정 안내 복사**를 사용할 수 있습니다.

## 실패했을 때

설치 스크립트는 실패 시 0이 아닌 종료 코드를 반환합니다. 완료로 보고하지 말고 실패 단계와 원인을 확인합니다. `.pinto/app.log`에는 앱 실행 로그가 남습니다. `npm run doctor -- --json`으로 실행 환경, 빌드와 소스 접근을 확인할 수 있습니다.

설치 스크립트를 다시 실행해도 `.pinto/baseline.json`과 사용자 코드를 덮어쓰지 않습니다. 이미지와 주석은 사용자 데이터 폴더 또는 지정한 작업 폴더의 `.image-notes/`에 유지됩니다. 운영체제 보안 설정이나 호스트 정책을 자동으로 완화하는 설치 단계를 추가하지 않습니다.
