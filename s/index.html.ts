import {template, html, easypage} from "@benev/turtle"
export default template(async basic => {
	const path = basic.path(import.meta.url)

	return easypage({
		path,
		css: "index.css",
		title: "omniclip",
		head: html`
			<link rel="stylesheet" href="/node_modules/@shoelace-style/shoelace/cdn/themes/dark.css" />
			<!-- devstudio 포팅: CDN(jsdelivr)·구글 폰트 대신 로컬(/node_modules·assets/fonts) — 133 인터넷 없이 동작 -->
			<script type="module" src="/node_modules/@shoelace-style/shoelace/cdn/shoelace.js" ></script>
			<!-- adding pixijs here because pixijs/filters work this way
				(because pixijs/filters does some global stuff work which
				doesnt seem to work when installing pixi through package json),
				but also adding pixijs to package json for types  -->
			<script src="/node_modules/pixi.js/dist/pixi.min.js"></script>
			<script src="/node_modules/pixi-filters/dist/browser/pixi-filters.js"></script>
			<script src="/node_modules/@pixi/graphics-extras/dist/graphics-extras.min.js"></script>
			<script src="/node_modules/@pixi-essentials/object-pool/dist/pixi-object-pool.js"></script>
			<script src="/node_modules/@pixi-essentials/bounds/dist/bounds.js"></script>
			<script src="/node_modules/@pixi-essentials/transformer/dist/transformer.js"></script>
			<!-- <script src="https://cdn.jsdelivr.net/npm/pixi.js@8.8.1/dist/pixi.min.js"></script> -->
			<!-- <script src="https://cdn.jsdelivr.net/npm/pixi-filters@6.1.0/dist/pixi-filters.min.js"></script> -->
			<script src="coi-serviceworker.js"></script>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<script type="importmap-shim" src="./importmap.json"></script>
			<script defer src="/node_modules/es-module-shims/dist/es-module-shims.js"></script>
			<script type="module-shim" src="./main.js"></script>
			<link rel="stylesheet" href="index.css">
			<link rel="icon" type="image/png" sizes="32x32" href="./assets/favicon-32x32.png">
			<title>omni-clip</title>
		`,
		body: html`
			<div class="loading-page-indicator">
				<img class="logo-loader" src="/assets/icon3.png" />
				<div class="loader"><div class="loaderBar"></div></div>
			</div>
		`
	})
})
