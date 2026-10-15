from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from html import escape
import base64
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'brand-concepts'
OUT.mkdir(exist_ok=True)
FONTS = {
    'sans': 'arial.ttf', 'bold': 'arialbd.ttf',
    'serif': 'georgia.ttf', 'serifbold': 'georgiab.ttf',
    'ko': 'malgun.ttf', 'kobold': 'malgunbd.ttf',
    'technical': 'bahnschrift.ttf',
}
FONT_CACHE = {}

def font(key):
    if key not in FONT_CACHE:
        f = TTFont('C:/Windows/Fonts/' + FONTS[key])
        FONT_CACHE[key] = (f, f.getGlyphSet(), f.getBestCmap(), f['head'].unitsPerEm)
    return FONT_CACHE[key]

def label(s, x, y, size, color, family='sans', tracking=0, maxwidth=None):
    f, gs, cmap, upm = font(family)
    scale = size / upm
    pen = SVGPathPen(gs)
    cursor = x
    for ch in s:
        glyph = cmap.get(ord(ch))
        if glyph is None:
            raise ValueError(f'Missing glyph {ch!r} in {family}')
        gs[glyph].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, y)))
        cursor += f['hmtx'][glyph][0] * scale + tracking
    if maxwidth is not None and cursor - x > maxwidth:
        raise ValueError(f'Text too wide ({cursor-x:.0f}>{maxwidth}): {s}')
    return f'<path fill="{color}" d="{pen.getCommands()}"/>'

def rect(x,y,w,h,color,r=0,stroke=None,sw=1):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{color}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>'

def line(x1,y1,x2,y2,color,sw=1,dash=None):
    return f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{color}" stroke-width="{sw}"'+(f' stroke-dasharray="{dash}"' if dash else '')+'/>'

def circle(x,y,r,color,stroke=None,sw=1):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>'

def svg(w,h,body,title,desc=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img"><title>{escape(title)}</title><desc>{escape(desc)}</desc>{body}</svg>'

def mark(key, color, bg, mono=False):
    if key == 'pinto':
        return f'<path fill="{color}" fill-rule="evenodd" d="M22 5H43C54 5 61 13 61 24V36C61 48 53 55 42 55H26L11 64V52C5 48 2 42 2 34V25C2 13 10 5 22 5Z M42 30A10 10 0 1 0 22 30A10 10 0 1 0 42 30Z M36 30A4 4 0 1 0 28 30A4 4 0 1 0 36 30Z"/>'
    if key == 'locus':
        return f'<path d="M24 8H8V24M40 8H56V24M56 40V56H40M24 56H8V40" fill="none" stroke="{color}" stroke-width="7"/>'+rect(26,26,12,12,color,1)
    return f'<path d="M25 8H9V56H25M35 18H56M35 32H50" fill="none" stroke="{color}" stroke-width="5"/>'+circle(40,50,6,color)

BRANDS = [
    dict(key='pinto', name='PINTO', no='01', descriptor='찍고, 적고, 전하는 즐거움',
         line='여기, 이렇게.', sub='이미지 위에 콕. AI에게 바로 전달.',
         position='누구나 바로 쓰는 친근한 이미지 지시 도구',
         personality='친근한 · 명쾌한 · 경쾌한',
         rationale='대상을 콕 찍는 점과 말풍선을 결합했습니다. 위치를 가리키는 행동과 말을 붙이는 행동을 하나의 심벌로 표현합니다.',
         colors=[('Paper','#F6F2E9','기본 배경'),('Ink','#262620','본문·주요 제목'),('Persimmon','#C64B28','주요 행동·선택 표시'),('Peach','#FFE1CB','코멘트·강조 배경'),('Muted','#65655F','보조 설명')],
         font='bold', typography='둥근 인상의 산세리프', fonts='Arial Bold / Segoe UI / Apple SD Gothic Neo / 맑은 고딕',
         tone='짧고 자연스럽게 말합니다. 기술 용어보다 사용자가 할 행동을 먼저 씁니다.',
         good=['여기에 어떤 지시를 남길까요?','지시 3개 복사했어요.','원하는 대로 바꿔 써도 좋아요.'],
         avoid='“주석 객체를 생성하세요”처럼 구현 용어를 앞세우지 않습니다.',
         ui='12–16px 모서리, 넉넉한 클릭 영역, 점과 둥근 번호 배지. 주요 버튼은 주홍색으로 한 개만 강조합니다.',
         fit='처음 쓰는 사람에게 가장 빠르게 다가가는 방향. 사용자 편의성을 우선하는 현재 제품에 추천합니다.',
         dark='#262620', accent='#C64B28', paper='#F6F2E9', ink='#262620', track=0),
    dict(key='locus', name='LOCUS', no='02', descriptor='의도를 정확한 좌표로',
         line='정확하게 가리키다.', sub='로컬 AI를 위한 이미지 지시 도구.',
         position='좌표와 의도를 명확히 전달하는 정밀 작업 도구',
         personality='정확한 · 단정한 · 신뢰할 수 있는',
         rationale='네 개의 선택 모서리와 중심점을 사용합니다. 이미지의 특정 범위를 지정하고 정확한 위치를 전달하는 제품의 기능을 직접 드러냅니다.',
         colors=[('Chalk','#F2F5FA','기본 배경'),('Navy','#13233F','본문·어두운 배경'),('Cobalt','#245BDB','주요 행동·선택 표시'),('Ice','#DCE7FB','선택·정보 배경'),('Slate','#56657B','보조 설명')],
         font='technical', typography='간결한 산세리프와 정렬된 숫자', fonts='Bahnschrift / Arial / Segoe UI / Apple SD Gothic Neo / 맑은 고딕',
         tone='결과와 상태를 정확하게 씁니다. 감탄사와 과도한 의인화를 줄입니다.',
         good=['수정할 영역을 지정하세요.','지시 3개를 복사했습니다.','원본 기준 좌표가 포함됩니다.'],
         avoid='“완벽한 결과를 보장합니다”처럼 검증할 수 없는 약속을 하지 않습니다.',
         ui='6–8px 모서리, 일정한 간격, 선명한 선택 테두리. 숫자와 좌표는 필요한 정보 패널에서만 표시합니다.',
         fit='개발자·디자이너가 정밀한 작업을 반복할 때 잘 어울립니다. 정확성과 신뢰를 가장 강하게 전달합니다.',
         dark='#13233F', accent='#245BDB', paper='#F2F5FA', ink='#13233F', track=3),
    dict(key='margin', name='MARGIN', no='03', descriptor='여백에서 선명해지는 의도',
         line='한 줄이면, 더 분명하게.', sub='이미지의 여백에, AI가 이해할 한 줄.',
         position='차분하게 생각을 정리하는 이미지 메모 도구',
         personality='차분한 · 사려 깊은 · 편집적인',
         rationale='여백을 만드는 괄호와 짧은 메모, 마지막 점을 결합했습니다. 이미지를 크게 보고 필요한 지시만 덧붙이는 경험을 상징합니다.',
         colors=[('Linen','#F2F0E6','기본 배경'),('Forest','#203C34','본문·주요 행동'),('Lime','#CEE978','강조 배경·선택 배지'),('Sage','#DCE4D8','보조 면'),('Moss','#61766C','보조 설명')],
         font='serifbold', typography='세리프 제목과 읽기 편한 산세리프 본문', fonts='Georgia / Segoe UI / Apple SD Gothic Neo / 맑은 고딕',
         tone='차분하고 간결하게 씁니다. 사용자가 생각을 정리할 여유를 줍니다.',
         good=['이곳에 지시를 남겨보세요.','지시를 복사했습니다.','필요한 만큼, 원하는 방식으로.'],
         avoid='감성적인 문장이 실제 조작 방법을 가리지 않도록 합니다.',
         ui='4–8px 모서리, 얇은 구분선, 넓은 여백. 세리프는 브랜드 제목에만 쓰고 작업 UI는 산세리프로 통일합니다.',
         fit='글과 시각 작업을 함께 다루는 제작자에게 적합합니다. 오래 열어 두어도 편안한 분위기를 지향합니다.',
         dark='#203C34', accent='#203C34', paper='#F2F0E6', ink='#203C34', track=1),
]

def logo_body(b, reverse=False, mono=False):
    ink = '#FFFFFF' if reverse else b['ink']
    accent = ink if mono or reverse else b['accent']
    hole = b['dark'] if reverse else b['paper']
    return f'<g transform="translate(4 6)">{mark(b["key"],accent,hole,mono)}</g>'+label(b['name'],82,58,44,ink,b['font'],b['track'])

def brand_logo(b,x,y,scale=1,reverse=False):
    return f'<g transform="translate({x} {y}) scale({scale})">{logo_body(b,reverse)}</g>'

def badge(n,x,y,fill,fg):
    return circle(x,y,15,fill)+label(str(n),x-5,y+6,16,fg,'bold')

def og_pinto(b):
    c=b['accent']; ink=b['ink']; paper=b['paper']
    p=rect(0,0,1200,630,paper)
    p+=circle(1105,55,265,'#FFE1CB')+circle(1143,636,220,'#E8EDDC')
    p+=brand_logo(b,60,42,.76)
    p+=label('POINT. NOTE. COPY.',65,158,13,c,'bold',2)
    p+=label('여기, 이렇게.',60,253,61,ink,'kobold',maxwidth=570)
    p+=label('찍고 말하면 끝.',60,333,61,ink,'kobold',maxwidth=575)
    p+=label(b['sub'],64,390,21,'#65655F','ko',maxwidth=550)
    p+=rect(64,450,240,52,ink,26)+label('찍기  →  입력  →  복사',88,483,18,'#FFFFFF','ko')
    p+=label('DESKTOP IMAGE NOTES',64,582,12,ink,'bold',1.7)
    p+=label('WINDOWS + macOS',344,582,12,'#65655F','sans',1)
    card=rect(660,168,466,318,'#E5D5C6',20)+rect(650,155,466,318,'#FFFFFF',20)
    card+=rect(650,155,466,46,'#FCFAF5',20)+rect(650,182,466,19,'#FCFAF5')
    card+=circle(671,178,4,'#D7D3CA')+circle(686,178,4,'#D7D3CA')+circle(701,178,4,'#D7D3CA')
    card+=label('a clearer workspace',734,183,12,'#77766B','sans')
    card+=rect(677,222,226,210,'#F0F1E7',10)
    card+=rect(710,266,157,105,'#D4DDC8',8)+rect(722,250,104,98,'#8DAB82',5)
    card+=rect(743,237,104,98,'#FCFAF4',5)+line(761,261,827,261,'#B8C2AC',3)+line(761,276,813,276,'#B8C2AC',3)
    card+=circle(850,382,24,'#D5A786')+circle(850,382,14,'#F7E8D5')
    card+=label('Your space,',923,251,17,ink,'bold')+label('your pace.',923,275,17,ink,'bold')
    card+=rect(923,300,136,7,'#E3E4DC',3)+rect(923,315,113,7,'#E3E4DC',3)
    card+=rect(921,353,152,43,c,10)+label('Start here',952,380,14,'#FFFFFF','bold')
    card+=rect(913,344,168,61,'none',13,c,2)+badge(1,1081,345,c,'#FFFFFF')
    p+=card
    p+=line(998,405,998,465,c,2,'4 5')
    p+=rect(763,465,361,86,'#262620',16)+badge(1,792,495,'#FFE1CB',c)
    p+=label('이 버튼을 조금 더 크게.',817,502,20,'#FFFFFF','ko',maxwidth=295)
    p+=label('위치는 자동으로 함께 전달돼요.',817,528,13,'#C9C9BC','ko')
    p+=label('01 / BRAND CONCEPT',1000,598,10,ink,'sans',.6)
    return p

def og_locus(b):
    navy='#101C30'; light='#E9F0FF'; blue='#89B4FF'
    p=rect(0,0,1200,630,navy)
    for x in range(630,1201,30): p+=line(x,0,x,630,'#1C2A40')
    for y in range(0,631,30): p+=line(630,y,1200,y,'#1C2A40')
    p+=brand_logo(b,60,42,.76,True)
    p+=label('INTENT, WITH COORDINATES.',64,157,12,blue,'bold',1.5)
    p+=label('의도를 정확한',60,254,58,light,'kobold',maxwidth=570)
    p+=label('좌표로.',60,333,70,light,'kobold')
    p+=label(b['sub'],64,391,21,'#A7B8D3','ko')
    p+=line(64,456,554,456,'#3B4A62')
    p+=label('01  SELECT',64,489,12,blue,'bold',1)+label('02  ANNOTATE',223,489,12,blue,'bold',1)+label('03  COPY',425,489,12,blue,'bold',1)
    p+=label('WINDOWS + macOS',64,582,12,'#A7B8D3','sans',1.4)
    p+=rect(666,149,470,337,'#F2F5FA',6)
    p+=rect(666,149,470,42,'#DCE7FB',6)+rect(666,174,470,17,'#DCE7FB')
    p+=label('REFERENCE / 1920 × 1080',688,176,12,'#13233F','technical',1)
    p+=rect(687,210,111,253,'#E5EBF5',3)
    for y,w in [(230,75),(263,54),(296,65),(329,49)]: p+=rect(705,y,w,6,'#B5C3D9',2)
    p+=rect(819,214,291,16,'#13233F',2)+rect(819,244,202,6,'#B5C3D9',2)
    p+=rect(819,276,136,94,'#DCE7FB',4)+rect(972,276,136,94,'#DCE7FB',4)
    p+=label('01',836,335,38,'#245BDB','technical')+label('02',989,335,38,'#245BDB','technical')
    p+=rect(819,402,154,42,'#245BDB',4)+label('Apply changes',836,428,14,'#FFFFFF','bold')
    p+=rect(810,393,172,60,'none',0,'#245BDB',2)+badge(1,982,393,'#245BDB','#FFFFFF')
    p+=line(810,393,810,128,blue,1,'5 5')+line(630,453,1148,453,blue,1,'5 5')
    p+=rect(793,102,268,33,'#245BDB',3)+label('x: 1240   y: 80   w: 160   h: 48',809,124,12,'#FFFFFF','technical')
    p+=rect(736,504,400,62,'#245BDB',5)+label('01',754,543,18,'#FFFFFF','technical')
    p+=label('이 버튼의 폭을 옆 요소와 맞춰줘.',797,542,17,'#FFFFFF','ko',maxwidth=325)
    p+=label('02 / BRAND CONCEPT',998,598,10,'#A7B8D3','sans',.6)
    return p

def og_margin(b):
    ink=b['ink']; paper=b['paper']
    p=rect(0,0,1200,630,paper)+brand_logo(b,60,39,.76)
    p+=label('NOTES THAT MOVE IDEAS FORWARD',702,83,11,ink,'sans',1.3)
    p+=line(64,119,1136,119,'#BCC7B7')
    p+=label('Make room',61,235,66,ink,'serif',maxwidth=570)
    p+=label('for clarity.',61,316,66,ink,'serif',maxwidth=570)
    p+=label('이미지의 여백에,',65,378,22,ink,'ko')
    p+=label('AI가 이해할 한 줄.',65,412,22,ink,'ko')
    p+=rect(65,462,201,44,'#CEE978',0)+label('가리키고, 한 줄 남기기',81,491,17,ink,'ko')
    p+=rect(745,164,354,340,'#DEE3D5',0)+rect(733,152,354,340,'#FFFFFF',0)
    p+=label('FIELD NOTES',755,185,10,ink,'bold',2)+label('01',1039,185,12,ink,'serif')
    p+=line(755,201,1065,201,'#D1D7CA')
    p+=rect(755,220,310,151,'#DCE4D8',0)
    p+=circle(928,291,57,'#C0CFB8')+rect(815,248,93,83,'#F2F0E6',0)
    p+=line(835,269,886,269,'#BCC7B7',3)+line(835,285,878,285,'#BCC7B7',3)
    p+=rect(920,310,94,17,'#203C34',0)+circle(982,259,19,'#CEE978')
    p+=label('A place to begin.',755,408,24,ink,'serif')
    p+=line(755,433,1010,433,'#B8C4B4',5)+line(755,450,950,450,'#B8C4B4',5)
    p+=f'<path d="M741 246V213H775M1044 213H1078V246M1078 350V382H1044M775 382H741V350" fill="none" stroke="{ink}" stroke-width="2"/>'
    p+=badge(1,1078,213,ink,paper)
    p+=line(741,382,695,382,ink,1)+line(695,382,695,479,ink,1)
    p+=rect(634,479,502,62,'#CEE978',0)+label('01',652,517,18,ink,'serif')
    p+=label('이 부분의 여백을 조금 더 넓혀줘.',695,517,18,ink,'ko',maxwidth=420)
    p+=line(64,561,1136,561,'#BCC7B7')
    p+=label('A QUIETER WAY TO DIRECT AI.',64,598,11,ink,'sans',1.3)
    p+=label('WINDOWS + macOS',592,598,11,ink,'sans',1)
    p+=label('03 / BRAND CONCEPT',997,598,10,ink,'sans',.6)
    return p

def contrast(a,b):
    def lum(c):
        vals=[int(c[i:i+2],16)/255 for i in (1,3,5)]
        vals=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in vals]
        return sum(v*w for v,w in zip(vals,[.2126,.7152,.0722]))
    l1,l2=sorted([lum(a),lum(b)],reverse=True)
    return (l1+.05)/(l2+.05)

def make_assets():
    for b,fn in zip(BRANDS,[og_pinto,og_locus,og_margin]):
        d=OUT/b['key']; d.mkdir(exist_ok=True)
        for name,reverse,mono in [('logo',False,False),('logo-mono',False,True),('logo-reversed',True,True)]:
            (d/f'{name}.svg').write_text(svg(360,80,logo_body(b,reverse,mono),b['name']+' logo',b['rationale']),encoding='utf-8')
        (d/'mark.svg').write_text(svg(72,72,f'<g transform="translate(4 2)">{mark(b["key"],b["accent"],b["paper"])}</g>',b['name']+' mark',b['rationale']),encoding='utf-8')
        (d/'og.svg').write_text(svg(1200,630,fn(b),b['name']+' OG image',b['sub']+' 브랜드 콘셉트와 제품 UI 예시.'),encoding='utf-8')
        b['contrast'] = {'body':round(contrast(b['ink'],b['paper']),2),'button':round(contrast('#FFFFFF',b['accent']),2)}
        if b['contrast']['body'] <4.5 or b['contrast']['button']<4.5: raise ValueError('Contrast too low: '+b['key'])
        tokens={'name':b['name'],'concept':b['position'],'colors':{c[0]:c[1] for c in b['colors']},'fonts':b['fonts'],'clearSpace':'심벌 폭의 1/4 이상','minimumSize':{'markPx':24,'lockupPx':140},'og':{'width':1200,'height':630},'contrast':b['contrast']}
        (d/'tokens.json').write_text(json.dumps(tokens,ensure_ascii=False,indent=2),encoding='utf-8')
    print('SVG assets generated',flush=True)

def render_ogs():
    edge=Path('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
    profile=ROOT/'.brand-build'/'edge-profile'
    profile.mkdir(parents=True,exist_ok=True)
    for b in BRANDS:
        d=OUT/b['key']
        cmd=[str(edge),'--headless','--disable-gpu','--hide-scrollbars','--no-first-run','--disable-extensions','--force-device-scale-factor=1','--window-size=1200,630','--run-all-compositor-stages-before-draw',f'--user-data-dir={profile}',f'--screenshot={d/"og.png"}',(d/'og.svg').as_uri()]
        p=subprocess.run(cmd,capture_output=True,timeout=45,creationflags=subprocess.CREATE_NO_WINDOW)
        if not (d/'og.png').exists(): raise RuntimeError(p.stderr.decode(errors='replace')[-2500:])
        from PIL import Image
        im=Image.open(d/'og.png')
        assert im.size==(1200,630), im.size
        print('Rendered',b['key'],im.size,flush=True)

def guide():
    blocks=[]
    for b in BRANDS:
        d=OUT/b['key']
        og='data:image/png;base64,'+base64.b64encode((d/'og.png').read_bytes()).decode()
        logo=(d/'logo.svg').read_text(encoding='utf-8')
        rev=(d/'logo-reversed.svg').read_text(encoding='utf-8')
        mono=(d/'logo-mono.svg').read_text(encoding='utf-8')
        assetlinks=''.join(f'<a download="{b["key"]}-{name}" href="data:{mime};base64,{base64.b64encode((d/name).read_bytes()).decode()}">{title}</a>' for name,mime,title in [('logo.svg','image/svg+xml','로고 SVG'),('mark.svg','image/svg+xml','심벌 SVG'),('og.png','image/png','OG PNG'),('og.svg','image/svg+xml','OG SVG')])
        swatches=''.join(f'<div class="swatch"><div style="background:{hex}"></div><strong>{n}</strong><code>{hex}</code><small>{use}</small></div>' for n,hex,use in b['colors'])
        samples=''.join(f'<li>{escape(t)}</li>' for t in b['good'])
        blocks.append(f'''<section id="{b['key']}" class="brand" style="--paper:{b['paper']};--ink:{b['ink']};--accent:{b['accent']}">
          <div class="section-head"><span class="index">{b['no']}</span><div><span class="eyebrow">{b['personality']}</span><h2>{b['name']}</h2></div><p>{b['position']}</p></div>
          <div class="og"><img src="{og}" width="1200" height="630" alt="{b['name']} OG 이미지: {b['sub']}"></div>
          <div class="download">{assetlinks}</div>
          <div class="two-col"><div><h3>브랜드의 중심</h3><p class="large">{b['line']}</p><p>{b['fit']}</p></div><div><h3>로고의 의미</h3><p>{b['rationale']}</p><p class="muted">가칭 브랜드명 · 선택 후 제품 이름으로 확정</p></div></div>
          <div class="logos"><div style="background:{b['paper']}">{logo}<span>Primary</span></div><div style="background:{b['dark']};color:#fff">{rev}<span>Reversed</span></div><div style="background:#fff">{mono}<span>Monochrome</span></div></div>
          <div class="two-col rules"><div><h3>로고 사용 규칙</h3><p>심벌 폭의 1/4 이상 여백을 확보합니다. 심벌은 24px, 가로 로고는 140px 이상으로 사용합니다. 작은 아이콘에는 심벌만 씁니다.</p><p>색상은 제공된 기본·단색·반전 버전으로 유지합니다. 늘이기, 회전, 외곽선 추가, 그림자 효과는 사용하지 않습니다.</p></div><div><h3>글자와 화면</h3><p><strong>{b['typography']}</strong><br>{b['fonts']}</p><p>{b['ui']}</p><p class="muted">본문 14–16px, 줄 높이 1.5–1.6. 키보드 포커스와 번호를 함께 사용해 색상만으로 상태를 구분하지 않습니다.</p></div></div>
          <h3>컬러 시스템</h3><div class="swatches">{swatches}</div>
          <p class="muted contrast">본문/기본 배경 대비 {b['contrast']['body']}:1 · 흰 글자/주요 버튼 대비 {b['contrast']['button']}:1. 보조색은 작은 본문에 사용하기 전에 별도 확인합니다.</p>
          <div class="two-col"><div><h3>문장 톤</h3><p>{b['tone']}</p><ul class="voice">{samples}</ul><p class="muted">{b['avoid']}</p></div><div><h3>OG 이미지 규칙</h3><p>1200 × 630px, PNG와 편집용 SVG를 함께 제공합니다. 핵심 제목과 로고는 가장자리에서 48px 이상 떨어뜨립니다.</p><p>브랜드 이름, 짧은 약속, 이미지에 지시를 붙이는 장면을 한 장에 담습니다. 코드와 좌표는 제품 설명에 필요한 만큼만 사용합니다.</p><p class="muted">로고와 OG의 글자는 패스로 변환해 표시 환경에 따른 폰트 깨짐을 방지했습니다. tokens.json에서 컬러와 기본 규칙을 확인할 수 있습니다.</p></div></div>
        </section>''')
    html='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>이미지 지시 편집기 · 브랜드 3안</title><style>
    :root{color-scheme:light;--text:#252722;--muted:#696d64;--line:#dce0d6}*{box-sizing:border-box}html{scroll-behavior:auto;scroll-padding-top:80px}body{margin:0;background:#f9faf6;color:var(--text);font-family:'Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif;line-height:1.7}header{background:#18251e;color:#f5f7ef;padding:68px max(28px,calc((100vw - 1120px)/2)) 60px}header .eyebrow{color:#b5caa8;font-size:11px;letter-spacing:3px}h1{font-size:clamp(30px,4.5vw,55px);line-height:1.25;letter-spacing:-2px;margin:22px 0}header p{max-width:700px;color:#cbd6c6;font-size:16px}nav{position:sticky;top:0;background:#f9faf6f5;backdrop-filter:blur(12px);border-bottom:1px solid var(--line);z-index:3;display:flex;justify-content:center;gap:8px;padding:12px 20px}nav a{padding:7px 20px;color:#43503e;text-decoration:none;border-radius:24px;font-size:13px}nav a:hover,nav a:focus-visible{background:#e4ebda;outline:2px solid #839875}main{max-width:1180px;margin:auto;padding:0 30px}.intro{padding:42px 0 12px}.intro p{max-width:790px}.recommend{border-left:3px solid #c64b28;padding:8px 18px;background:#f5eee3}.compare{width:100%;border-collapse:collapse;margin:26px 0 8px;font-size:14px}.compare th,.compare td{text-align:left;padding:15px 12px;border-bottom:1px solid var(--line)}.compare th{font-weight:500;color:var(--muted)}.brand{padding:60px 0;border-bottom:1px solid var(--line)}.section-head{display:flex;align-items:center;gap:23px;margin-bottom:28px}.section-head .index{font-family:Georgia,serif;font-size:48px;color:#adb4a5;font-style:italic}.section-head h2{font-size:37px;letter-spacing:1px;line-height:1.1;margin:7px 0}.eyebrow{font-size:12px;color:var(--muted);letter-spacing:1px}.section-head>p{margin-left:auto;max-width:330px;font-size:15px;color:var(--muted)}.og{overflow:hidden;border:1px solid var(--line);border-radius:12px}.og img{width:100%;height:auto;display:block}.download{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 38px}.download a{color:var(--ink);border:1px solid #ccd3c6;padding:7px 15px;border-radius:5px;text-decoration:none;font-size:12px;background:white}.download a:hover{background:var(--paper);border-color:var(--accent)}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:54px;margin:30px 0}h3{font-size:13px;font-weight:700;letter-spacing:.5px;margin:0 0 14px}p{margin:0 0 14px;font-size:14px}.large{font-size:28px;font-weight:600;letter-spacing:-1px;color:var(--ink)}.muted{color:var(--muted);font-size:12px}.logos{display:grid;grid-template-columns:1fr 1fr 1fr;margin:28px 0;border:1px solid var(--line);border-radius:8px;overflow:hidden}.logos>div{min-height:156px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:22px 15px}.logos svg{max-width:94%;height:65px}.logos span{font-size:10px;opacity:.7;letter-spacing:1px;margin-top:12px}.swatches{display:grid;grid-template-columns:repeat(5,1fr);gap:13px;margin-top:18px}.swatch>div{height:90px;border:1px solid #0000000a;border-radius:4px}.swatch strong,.swatch code,.swatch small{display:block;font-size:12px;margin-top:5px}.swatch strong{margin-top:12px}.swatch code,.swatch small{color:var(--muted)}.contrast{margin:15px 0 35px}.voice{margin:0 0 14px;padding:0;list-style:none}.voice li{padding:10px 14px;border-left:2px solid var(--accent);background:var(--paper);color:var(--ink);margin:8px 0;font-size:14px}footer{padding:35px 0 60px;color:var(--muted);font-size:12px}.footnote{max-width:760px}.print{margin-top:14px;background:none;border:1px solid #c5cebd;padding:9px 15px;border-radius:5px;cursor:pointer;color:#35452e}a:focus-visible,button:focus-visible{outline:3px solid #4476b6;outline-offset:3px}@media(max-width:700px){main{padding:0 20px}header{padding:42px 24px}nav a{padding:5px 10px;font-size:12px}.section-head{gap:15px;flex-wrap:wrap}.section-head>p{margin:0;max-width:none;flex-basis:100%}.two-col{grid-template-columns:1fr;gap:20px}.logos{grid-template-columns:1fr}.logos>div{min-height:125px}.swatches{grid-template-columns:repeat(3,1fr)}.compare{font-size:11px}.compare th,.compare td{padding:10px 6px}.brand{padding:40px 0}}@media print{nav,.download,.print{display:none}header{padding:25px;background:white;color:#18251e}header p,header .eyebrow{color:#43503e}main{max-width:none;padding:0}.brand{break-before:page;padding:20px 0}.two-col{gap:25px}.logos{break-inside:avoid}.og{max-width:760px}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body><header><div class="eyebrow">BRAND DIRECTIONS / 2026</div><h1>작은 표시에서,<br>명확한 지시로.</h1><p>로컬 AI와 함께 쓰고, 원하는 대로 고쳐 쓰는 이미지 지시 편집기.<br>같은 제품을 서로 다른 성격으로 표현한 세 가지 브랜드 방향입니다.</p></header>
    <nav aria-label="브랜드 탐색"><a href="#overview">비교</a><a href="#pinto">01 PINTO</a><a href="#locus">02 LOCUS</a><a href="#margin">03 MARGIN</a></nav><main>
    <section class="intro" id="overview"><p>공통 경험은 <strong>이미지 열기 → 가리키고 입력 → 지시 복사</strong>입니다. 세 안 모두 단독 데스크톱 창, 짧은 조작, AI가 수정할 수 있는 로컬 소스라는 제품 성격을 바탕으로 설계했습니다.</p><p class="recommend"><strong>추천: PINTO.</strong> 처음 쓰는 사람도 부담 없이 시작하는 인상이 가장 선명합니다. 좌표 정확성을 브랜드의 중심에 두려면 LOCUS, 차분한 창작 도구로 확장하려면 MARGIN이 어울립니다.</p>
    <table class="compare"><thead><tr><th>방향</th><th>첫인상</th><th>시각 언어</th><th>잘 맞는 사용자</th></tr></thead><tbody><tr><td><strong>PINTO</strong></td><td>쉽고 친근함</td><td>주홍색 · 둥근 말풍선 · 큰 클릭 영역</td><td>처음 사용하는 모든 사람</td></tr><tr><td><strong>LOCUS</strong></td><td>정확하고 믿음직함</td><td>코발트 · 선택 모서리 · 정렬</td><td>개발자와 디자이너</td></tr><tr><td><strong>MARGIN</strong></td><td>차분하고 세련됨</td><td>포리스트 · 여백 · 편집적 타이포</td><td>시각 작업과 글을 함께 다루는 제작자</td></tr></tbody></table></section>'''+''.join(blocks)+'''<footer><p class="footnote">제공 파일: 각 안의 SVG 로고 3종, SVG 심벌, 1200×630 PNG OG 이미지와 편집용 SVG, 컬러·타입 규칙 JSON. 이 문서는 이미지가 포함된 단일 HTML 파일로, 인터넷 연결 없이 열 수 있습니다. 화면 예시는 브랜드 표현을 위한 콘셉트입니다.</p><button class="print" onclick="window.print()">인쇄 / PDF로 저장</button></footer></main></body></html>'''
    (OUT/'index.html').write_text(html,encoding='utf-8')
    notes='브랜드 3안\n\nindex.html을 열면 세 안을 비교하고 SVG/PNG를 다운로드할 수 있습니다.\n\n각 폴더: logo.svg 기본 로고 / logo-mono.svg 단색 / logo-reversed.svg 어두운 배경용 / mark.svg 심벌 / og.png 1200×630 / og.svg 편집 원본 / tokens.json 컬러와 규칙\n\n로고·OG의 글자는 벡터 패스이며 별도 폰트 설치 없이 표시됩니다. 레이아웃과 컬러는 SVG에서 수정할 수 있습니다. 문구 변경은 저장소의 scripts/create_brand_concepts.py를 편집해 재생성할 수 있습니다(생성 스크립트는 Windows 폰트와 Edge를 사용).\n브랜드명은 디자인 검토를 위한 가칭입니다.\n'
    (OUT/'README.txt').write_text(notes,encoding='utf-8')
    with zipfile.ZipFile(OUT/'brand-concepts.zip','w',zipfile.ZIP_DEFLATED) as z:
        for f in sorted(OUT.rglob('*')):
            if f.is_file() and f.suffix!='.zip': z.write(f,f.relative_to(OUT))
    print('Guide and ZIP generated',flush=True)

if __name__=='__main__':
    make_assets()
    render_ogs()
    guide()
