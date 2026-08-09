# Apple Editorial Blog Design Specification

> 适用于个人博客 / 内容型网站的 Apple Editorial 风格设计规范。  
> 目标：用于 Codex、React、Next.js 等项目的 UI 构建约束。

---

## 1. 核心设计方向

Apple Editorial 风格的重点不是“像 Apple 官网”，而是以下原则：

- 内容优先
- 大面积留白
- 超大标题
- 极少装饰
- 克制的颜色
- 精确的字体层级
- 杂志式内容编排
- 轻微但顺滑的动效
- 卡片用于强调，而不是所有内容都卡片化

整体气质：

- Premium
- Editorial
- Calm
- Minimal
- Modern

避免：

- Dashboard
- SaaS 后台
- Material Design
- Bento 堆满屏幕
- 玻璃拟态
- 强渐变科技感
- 密集信息流

---

## 2. Color System

整体以暖灰白 + 接近纯黑为主。

```css
:root {
  --bg: #f5f5f7;
  --surface: #ffffff;

  --text-primary: #1d1d1f;
  --text-secondary: #424245;
  --text-muted: #6e6e73;
  --text-light: #86868b;

  --border: #d2d2d7;
  --border-soft: rgba(0, 0, 0, 0.06);

  --black: #000000;
  --white: #ffffff;
}
```

### 使用原则

页面背景：

```text
#f5f5f7
```

不要直接使用纯白铺整个页面。

正文：

```text
#1d1d1f
```

辅助文字：

```text
#6e6e73
```

弱化信息：

```text
#86868b
```

---

## 3. Typography

字体是整个设计最重要的部分。

优先字体栈：

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Display",
  "SF Pro Text",
  "Helvetica Neue",
  Helvetica,
  Arial,
  "PingFang SC",
  "Hiragino Sans GB",
  "Microsoft YaHei",
  sans-serif;
```

中文优先：

```text
PingFang SC
苹方
```

不建议作为主要视觉字体：

- 思源宋体
- 微软雅黑
- Roboto
- Inter 作为唯一字体

---

## 4. Typography Scale

### Hero Display

桌面端：

```css
font-size: clamp(64px, 8vw, 128px);
font-weight: 700;
line-height: 0.9;
letter-spacing: -0.06em;
```

示例：

```text
Ideas worth
slowing down for.
```

中文：

```text
值得慢下来
阅读的东西。
```

### Section Title

```css
font-size: clamp(48px, 5vw, 64px);
font-weight: 700;
line-height: 1;
letter-spacing: -0.04em;
```

### Card Title

```css
font-size: 36px;
font-weight: 700;
line-height: 1.05;
letter-spacing: -0.04em;
```

大型 Featured Card 可以提升至：

```css
font-size: 48px;
```

普通 Card：

```css
font-size: 24px;
```

### Lead Text

```css
font-size: clamp(24px, 2.2vw, 30px);
line-height: 1.3;
letter-spacing: -0.02em;
color: #424245;
```

### Body

普通摘要：

```css
font-size: 16px;
line-height: 1.6;
color: #6e6e73;
```

文章正文：

```css
font-size: 20px;
line-height: 1.75;
```

### Metadata

```css
font-size: 13px;
color: #86868b;
```

---

## 5. Layout

最大页面宽度：

```css
--container-width: 1240px;
```

推荐：

```css
.container {
  width: min(calc(100% - 40px), 1240px);
  margin: 0 auto;
}
```

不要让内容无限扩展到 1600px 以上。

---

## 6. Spacing System

Apple Editorial 最重要的规则之一：

> 宁可空，也不要挤。

推荐 spacing：

```text
4
8
12
16
20
24
32
40
48
64
80
96
120
160
```

普通 Section：

```css
padding-block: 96px;
```

Hero：

```css
padding-top: 100px;
padding-bottom: 80px;
```

标题与正文间距：

```text
24px ~ 40px
```

Section 之间：

```text
80px ~ 120px
```

---

## 7. Grid System

### Hero

推荐：

```css
grid-template-columns: 1.3fr 0.7fr;
```

### Featured

推荐：

```css
grid-template-columns: 1.25fr 0.75fr;
gap: 22px;
```

---

## 8. Card Design

```css
.card {
  background: #fff;
  border-radius: 28px;
  overflow: hidden;
}
```

推荐圆角：

```text
24px ~ 32px
```

默认：

```text
28px
```

默认阴影：

```css
box-shadow: 0 1px 0 rgba(0,0,0,.02);
```

Hover：

```css
box-shadow: 0 18px 60px rgba(0,0,0,.08);
```

避免：

- 很重的阴影
- 蓝色 Glow
- Neon
- Border + Shadow + Gradient 同时使用

---

## 9. 图片规范

核心原则：

> 一张大图 > 六张小图

Featured Image 推荐比例：

```text
16:10
3:2
4:3
```

图片应该：

- 干净
- 主体明确
- 少文字
- 色彩统一
- 大面积视觉主体
- 可使用抽象摄影、产品摄影、建筑、自然、艺术摄影

不要每个 Card 都塞图。

---

## 10. Navigation

Navbar 高度：

```text
56px ~ 64px
```

推荐：

```text
62px
```

背景：

```css
background: rgba(245,245,247,.82);
backdrop-filter: saturate(180%) blur(20px);
```

导航文字：

```css
font-size: 13px;
```

避免：

- 大按钮
- 图标过多
- Sidebar
- 复杂 Mega Menu

---

## 11. Border

```css
border-bottom: 1px solid #d2d2d7;
```

Section 之间优先使用极细分割线，而不是背景色块、阴影或额外容器。

---

## 12. Buttons

```css
background: #1d1d1f;
color: #fff;
padding: 9px 16px;
border-radius: 999px;
```

适合文字：

- Read
- Subscribe
- Explore

按钮整体应该偏小，避免大型 CTA。

---

## 13. Hover Interaction

Card：

```css
transform: translateY(-4px);
```

Transition：

```css
transition: 300ms cubic-bezier(.2,.8,.2,1);
```

避免：

- scale(1.1)
- rotate
- glow
- bounce

---

## 14. Scroll Animation

推荐：

```text
Fade + TranslateY
```

初始：

```css
opacity: 0;
transform: translateY(20px);
```

进入：

```css
opacity: 1;
transform: translateY(0);
```

时间：

```text
600ms ~ 800ms
```

可使用 `IntersectionObserver` 实现。

---

## 15. 首页信息架构

推荐：

```text
Navbar

Hero
↓
Featured Stories
↓
Latest Stories
↓
Editorial Statement
↓
Archive
↓
Newsletter
↓
Footer
```

避免首页只是连续的文章列表。

---

## 16. Hero Structure

推荐：

```text
Independent notes on design, technology & culture.

Ideas worth
slowing down for.

一个关于设计、产品和技术的独立博客。
记录值得认真思考的东西。

                              Issue 024
                              August 2026
                              Shanghai
```

Hero 的目标不是介绍网站功能，而是先建立气质。

---

## 17. Article Card

推荐：

```text
[ IMAGE ]

DESIGN / LONG READ

为什么真正高级的界面，
总是在做减法。

从层级、留白到动效，
重新理解简单背后的复杂判断。
```

原则：

- Metadata 永远弱化
- 文章标题永远是视觉主体

---

## 18. Latest Stories

不建议所有文章都做成 Card。

推荐：

```text
01

从首页开始，
建立一个网站的气质。

Design · 8 min read
────────────────────
```

这种形式更接近 Editorial。

---

## 19. Archive

Archive 应该非常简单：

```text
08.06    一个好的博客首页，应该先解决什么？       Design
07.28    内容密度与阅读疲劳之间的平衡             Editorial
07.16    为什么现在的网站越来越像杂志             Culture
```

Hover：

- 轻微背景变化
- 轻微左右 Padding 位移

不要 Card 化。

---

## 20. Responsive

### Desktop

```text
Max width: 1240px
```

### Tablet

```text
768px ~ 1024px
```

### Mobile

```text
< 640px
```

移动端 Hero 字号可从约 `128px` 收缩到约 `54px`。

双栏布局：

```text
2 Columns
→
1 Column
```

Navbar：

```text
隐藏中间 Navigation
只保留 Brand + CTA
```

---

## 21. Design Tokens

```css
:root {
  --color-background: #f5f5f7;
  --color-surface: #ffffff;

  --color-text-primary: #1d1d1f;
  --color-text-secondary: #424245;
  --color-text-muted: #6e6e73;

  --color-border: #d2d2d7;

  --container: 1240px;

  --radius-sm: 16px;
  --radius-md: 22px;
  --radius-lg: 28px;
  --radius-pill: 999px;

  --space-xs: 8px;
  --space-sm: 16px;
  --space-md: 24px;
  --space-lg: 40px;
  --space-xl: 64px;
  --space-2xl: 96px;
  --space-3xl: 128px;

  --ease-editorial: cubic-bezier(.2,.8,.2,1);
}
```

---

## 22. Component Architecture

React / Next.js 推荐：

```text
components/

  layout/
    Header
    Footer
    Container

  editorial/
    Hero
    SectionHeader
    FeaturedStory
    StoryCard
    StoryList
    ArchiveList
    EditorialQuote
    Newsletter

  typography/
    DisplayTitle
    SectionTitle
    Eyebrow
    Metadata
```

页面：

```text
app/
  page.tsx

  blog/
    page.tsx

  blog/
    [slug]/
      page.tsx

  about/
    page.tsx
```

---

## 23. UI Constitution

以下规则应视为强约束：

```text
Do not make every section a card.

Do not overuse rounded rectangles.

Typography and whitespace are the primary visual system.

Use large editorial headlines and restrained metadata.

Prefer thin separators over containers.

Animations must be subtle and functional.

Keep the palette neutral.

Every page should feel calm, spacious and premium.
```

---

# Codex Prompt

```text
Build a premium editorial-style personal blog inspired by Apple's
editorial design language, without copying Apple branding or assets.

Design principles:

- Content-first editorial layout
- Large typography
- Generous whitespace
- Neutral light-gray background (#f5f5f7)
- White content surfaces
- Primary text #1d1d1f
- Secondary text #6e6e73
- Thin #d2d2d7 separators
- Maximum content width 1240px
- Large section spacing: 80–120px
- Rounded cards around 28px only for featured content
- Do not place every piece of content inside cards
- Use magazine-style asymmetric grids
- Featured content should use large imagery
- Latest stories should use minimal editorial rows
- Archive should resemble a clean publication index
- Navigation should be minimal and translucent
- Use system / SF-style typography
- Display headlines should use tight letter spacing
- Use subtle fade/translate scroll animations
- Hover interactions should be restrained
- Fully responsive for desktop, tablet and mobile

Visual mood:

calm
premium
editorial
minimal
thoughtful
modern

Avoid:

dashboard aesthetics
glassmorphism
heavy gradients
neon colors
excessive shadows
dense UI
too many pills
too many cards
Material Design styling
```

---

# 最核心原则

> 用排版和留白创造高级感，而不是靠组件、阴影和特效创造高级感。
