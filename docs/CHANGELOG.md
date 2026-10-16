# PINTO 변경 기록

## 0.3.0 — Multi-image work / Varias imágenes / 여러 이미지

- Open or drop up to 20 images as one work; append images and switch via thumbnails. Keep per-image annotations and undo history during switching.
- Add auto-saved instructions scoped to selected images, with an optional reference image. Copy/export every path, image number, original-pixel coordinate, and shared instruction together.
- Preserve stable image numbers, restore whole groups from Recent work, and prevent removing images that are still referenced. Partial import failures retain successful imports.
- English, Spanish and Korean UI and instructions are included. Single-image document formats remain compatible.

Ahora puedes trabajar con hasta 20 imágenes, añadir instrucciones compartidas y elegir una referencia. Se conservan los números, las notas y los grupos al reiniciar.

최대 20장을 묶어 이미지별 지시와 공통·참고 지시를 작성하고 한 번에 복사할 수 있습니다. 기존 단일 이미지 데이터는 그대로 유지됩니다.

## 0.2.0 — English / Español / 한국어

- Added English and Spanish UI, native menu/dialog labels, app errors, help, clipboard/TXT instructions, and installation/customization messages.
- Added system-language detection, a visible language selector, saved preferences, and `--language` / `-Language` options. Existing notes and coordinates remain unchanged.
- Added English and Spanish README, installation and maintenance guides, localized sample images, and real UI recordings with localized notes and narration.
- Added catalog/placeholder checks and real Electron tests for switching, persistence, dialogs, errors, clipboard output, narrow windows, and preserving existing work.

### Español

- Interfaz, ayuda, menús, diálogos, errores, instrucciones copiadas y mensajes de instalación en español e inglés.
- Selector de idioma persistente, detección del idioma del sistema y ejemplos reales en ambos idiomas. Las notas del usuario se conservan sin traducir.

## 0.1.3

- 상단에 **이미지 닫기**를 추가했습니다. 마지막 입력을 저장한 뒤 시작 화면으로 돌아갑니다.
- 닫은 작업은 최근 작업에서 다시 열 수 있으며, 앱을 재실행해도 자동으로 열리지 않습니다. 이미지 파일과 지시는 삭제하지 않습니다.

## 0.1.2

- 표시 도구를 **네모·동그라미·점·선·자유도형** 다섯 가지로 구분했습니다. 모든 도구의 이름을 화면에 표시합니다.
- 점은 클릭, 네모·동그라미·선은 드래그, 자유도형은 손으로 그리는 방식입니다.
- 동그라미는 원·타원을 지원하고, 선택 후 크기를 조절할 수 있습니다. 선은 시작점과 끝점을 각각 이동할 수 있습니다.
- 서로 다른 도형도 하나의 지시에 묶을 수 있습니다. 복사할 때 도형의 종류와 좌표를 함께 전달합니다.
- 선과 타원을 포함하는 문서는 형식 버전 3으로 저장하며 버전 1·2도 계속 읽습니다.

## 0.1.1

- 자유선 도구 추가: 원·밑줄·화살표 모양을 자유롭게 표시한 뒤 코멘트를 작성할 수 있습니다. 여러 선을 같은 지시에 묶고 이동·실행 취소·복원할 수 있습니다.
- 자유선의 좌표와 경로를 복사되는 지시에 포함합니다. 자유선은 위치 표시이며 정밀한 사물 선택 마스크가 아닙니다.
- 기본 화면에서 작업 폴더 연결을 제거했습니다. 이미지는 자동 보관하며 필요할 때만 보조 메뉴에서 저장 위치를 바꿉니다.
- 새 작업의 전체 지시 입력란을 제거했습니다. 공통 조건은 AI 대화에서 함께 입력합니다. 기존에 작성한 전체 지시는 지시 목록의 접힌 항목에서 확인·수정할 수 있고 복사에도 포함됩니다.
- 원본을 만든 AI 대화에 붙여넣기, 새 대화에서 원본 이미지도 함께 전달하기를 화면·사용 방법·복사 완료 알림에 명시했습니다.
- 표시가 없는 참고 이미지 파일을 바로 찾을 수 있는 버튼을 추가했습니다.
- 자유선 문서는 형식 버전 2로 저장하며 이전 버전 1 문서를 계속 읽을 수 있습니다.
- Windows 재실행 옵션을 구조화된 데이터로 전달해 보관 경로와 실행 확인 응답이 뒤섞이던 문제를 수정했습니다.
