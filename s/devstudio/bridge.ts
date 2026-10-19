/**
 * devstudio 포팅(RTM R-J28) — 동영상 편집 명령 다리. window.__video
 * 편집기 상태(omnislate.context — state·actions·controllers)를 평범한 값의 명령으로 노출한다(devstudio 어댑터 omniclip → MCP 도구 · BYOAI).
 * 바꾸는 명령은 편집기의 actions(되돌리기 기록)와 컨트롤러(타임라인·합성기)를 사람 조작과 같은 경로로 부른다.
 * 파일은 내용(base64)만 주고받는다 — 읽기·쓰기·형식 변환(ffmpeg)은 연결부 몫. 내보내기는 WebCodecs(H.264) + ffmpeg.wasm 다중화(mp4).
 */
import {omnislate} from "../context/context.js"

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const ctx = (): any => {
	const c = (omnislate as any).context
	if(!c) throw new Error("편집기가 아직 열리지 않았습니다(#/editor/<프로젝트>)")
	return c
}
const effect = (id: string) => {
	const e = ctx().state.effects.find((x: any) => x.id === id)
	if(!e) throw new Error(`클립 없음: ${id} — project_info 로 id 확인`)
	return e
}
const brief = (e: any) => ({
	id: e.id, kind: e.kind, name: e.name ?? (e.kind === "text" ? e.text : ""), track: e.track,
	at: Math.round(e.start_at_position), start: Math.round(e.start), end: Math.round(e.end), length: Math.round(e.end - e.start),
	...(e.kind === "text" ? {text: e.text, fontSize: e.fontSize} : {}),
	...(e.raw_duration ? {source: Math.round(e.raw_duration)} : {}),
})
const sprite = (e: any) => {
	const m = ctx().controllers.compositor.managers[`${e.kind}Manager`]
	return m?.get?.(e.id)?.sprite
}
// 영상·이미지를 지금 해상도에 맞춰 가운데(비율 유지) — 상태(rect)와 화면 객체(sprite)를 같이. rect 의 너비·높이는 표시 크기(다시 그릴 때 sprite.width 로 쓰인다)
const fit = (e: any) => {
	const c = ctx(), W = c.state.settings.width, H = c.state.settings.height
	const w0 = e.rect.width / (e.rect.scaleX || 1), h0 = e.rect.height / (e.rect.scaleY || 1)
	const k = Math.min(W / w0, H / h0)
	c.actions.set_effect_scale(e, {x: k, y: k}); c.actions.set_effect_width(e, w0 * k); c.actions.set_effect_height(e, h0 * k)
	c.actions.set_position_on_canvas(e, W / 2, H / 2)
	const sp = sprite(e); if(sp) { sp.scale.set(k, k); sp.x = W / 2; sp.y = H / 2 }
}
const redraw = async () => { const c = ctx(); await c.controllers.compositor.seek(c.state.timecode, true) }
const b64ToFile = (b64: string, name: string, type: string) => {
	const bin = atob(b64), u8 = new Uint8Array(bin.length)
	for(let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
	return new File([u8], name, {type})
}
const fileToB64 = async (f: Blob | Uint8Array) => {   // 내보낸 결과는 ffmpeg.wasm readFile 의 Uint8Array
	const u8 = f instanceof Uint8Array ? f : new Uint8Array(await f.arrayBuffer()); let s = ""
	for(let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
	return btoa(s)
}

const api = {
	ready: () => { try { return !!ctx().state && !!ctx().controllers.compositor.app } catch { return false } },
	info: () => {
		const s = ctx().state
		const effects = s.effects.map(brief).sort((a: any, b: any) => a.track - b.track || a.at - b.at)
		return {
			project: s.projectName, width: s.settings.width, height: s.settings.height, fps: s.timebase, bitrate: s.settings.bitrate,
			duration: Math.max(0, ...effects.map((e: any) => e.at + e.length)), timecode: Math.round(s.timecode),
			tracks: s.tracks.length, clips: effects, transitions: (s.transitions ?? []).length, filters: (s.filters ?? []).length,
			exporting: s.is_exporting, exportStatus: s.export_status,
		}
	},
	// 미디어 들이기 → 타임라인에 클립으로(빈 자리를 찾아). 같은 내용은 한 번만 저장된다
	importMedia: async (b64: string, name: string, type: string) => {
		const c = ctx(), media = c.controllers.media, mgr = c.controllers.compositor.managers
		const file = b64ToFile(b64, name, type)
		const before = new Set(c.state.effects.map((e: any) => e.id))
		await media.import_file(file)
		await media.are_files_ready()
		let m: any
		for(let i = 0; i < 100 && !m; i++) { m = [...media.values()].filter((x: any) => x.file.name === name).pop(); if(!m) await sleep(50) }   // 미디어 컨트롤러 = Map(hash → 미디어)
		if(!m) throw new Error("들이기 실패(형식을 확인하십시오: 영상·이미지·오디오)")
		if(m.kind === "video") { const [v] = await media.create_video_elements([m]); mgr.videoManager.create_and_add_video_effect(v, c.state) }
		else if(m.kind === "image") { const [im] = await media.create_image_elements([m]); await mgr.imageManager.create_and_add_image_effect(im, c.state) }
		else if(m.kind === "audio") { const [au] = await media.create_audio_elements([m]); mgr.audioManager.create_and_add_audio_effect(au, c.state) }
		for(let i = 0; i < 100 && c.state.effects.every((e: any) => before.has(e.id)); i++) await sleep(50)
		for(const e of c.state.effects.filter((x: any) => !before.has(x.id) && (x.kind === "video" || x.kind === "image"))) fit(e)
		await redraw()
		const added = c.state.effects.filter((e: any) => !before.has(e.id))
		return {added: added.map(brief), kind: m.kind}
	},
	textAdd: async (text: string, at = 0, length = 3000, size?: number, color?: string, track?: number) => {
		const c = ctx(), before = new Set(c.state.effects.map((e: any) => e.id))
		c.controllers.compositor.managers.textManager.create_and_add_text_effect(c.state)
		for(let i = 0; i < 50 && c.state.effects.every((e: any) => before.has(e.id)); i++) await sleep(30)
		const e = c.state.effects.find((x: any) => !before.has(x.id))
		// 상태와 화면 객체를 같이(편집기 글자 패널과 같은 경로) — 상태만 바꾸면 화면에는 "Default text" 가 남는다
		const sp = sprite(e), W = c.state.settings.width, H = c.state.settings.height
		c.actions.set_text_content(e, text); if(sp) sp.text = text
		if(size) { c.actions.set_font_size(e, size); if(sp) sp.style.fontSize = size }
		if(color) { c.actions.set_text_fill(e, color, 0); if(sp) { if(Array.isArray(sp.style.fill)) sp.style.fill[0] = color; else sp.style.fill = color; sp.updateText?.() } }
		const tw = sp?.width ?? 0, th = sp?.height ?? 0
		c.actions.set_position_on_canvas(e, Math.max(0, (W - tw) / 2), Math.max(0, H * 0.82 - th / 2)); if(sp) { sp.x = Math.max(0, (W - tw) / 2); sp.y = Math.max(0, H * 0.82 - th / 2) }
		c.actions.set_effect_start_position(e, at)
		c.actions.set_effect_end(e, length)
		c.actions.set_effect_duration(e, length)
		if(track !== undefined && track !== null) c.actions.set_effect_track(e, track)
		else {
			// 덮는 요소(자막)는 맨 위 트랙(0 — 번호가 작을수록 위에 그려진다)에. 다른 클립과 같은 트랙에서 겹치면 그리는 순서가 정해지지 않아
			// 내보내기에서 영상 아래로 숨는다(10-20 실측) — 새 트랙을 만들고 기존 클립을 한 칸씩 내린다
			c.actions.add_track()
			for(const o of c.state.effects.filter((x: any) => x.id !== e.id)) c.actions.set_effect_track(o, (o.track ?? 0) + 1)
			c.actions.set_effect_track(e, 0)
		}
		c.controllers.compositor.managers.textManager.update_text?.(e)
		await redraw()
		return brief(effect(e.id))
	},
	move: async (id: string, at?: number, track?: number) => {
		const c = ctx(), e = effect(id)
		if(at !== undefined && at !== null) c.actions.set_effect_start_position(e, Math.max(0, at))
		if(track !== undefined && track !== null) c.actions.set_effect_track(e, track)
		await redraw(); return brief(effect(id))
	},
	trim: async (id: string, start?: number, end?: number) => {
		const c = ctx(), e = effect(id)
		const s = start ?? e.start, en = end ?? e.end
		if(en <= s) throw new Error("끝이 시작보다 커야 합니다")
		if(e.raw_duration && en > e.raw_duration) throw new Error(`원본 길이(${Math.round(e.raw_duration)}ms)를 넘습니다`)
		c.actions.set_effect_start(e, s); c.actions.set_effect_end(e, en)
		await redraw(); return brief(effect(id))
	},
	split: async (id: string, at: number) => {
		const c = ctx(), e = effect(id)
		if(at <= e.start_at_position || at >= e.start_at_position + (e.end - e.start)) throw new Error("자를 위치가 클립 안에 있어야 합니다")
		const before = new Set(c.state.effects.map((x: any) => x.id))
		c.actions.set_timecode(at)
		c.controllers.timeline.set_selected_effect(e, c.state)
		c.controllers.timeline.split(c.state)
		await sleep(100); await redraw()
		return {parts: [brief(effect(id)), ...c.state.effects.filter((x: any) => !before.has(x.id)).map(brief)]}
	},
	remove: async (id: string) => {
		const c = ctx(), e = effect(id)
		c.controllers.timeline.set_selected_effect(e, c.state)
		c.controllers.timeline.remove_selected_effect(c.state)
		await redraw(); return api.info()
	},
	resolution: async (w: number, h: number) => {
		const c = ctx(); c.actions.set_project_resolution(w, h); c.controllers.compositor.set_canvas_resolution(w, h)
		for(const e of c.state.effects.filter((x: any) => x.kind === "video" || x.kind === "image")) fit(e)   // 해상도가 바뀌면 화면 밖으로 나가지 않게 다시 맞춤
		await redraw(); return api.info()
	},
	fps: (n: number) => { const c = ctx(); c.actions.set_timebase(n); c.controllers.compositor.set_timebase(n); return api.info() },
	bitrate: (kbps: number) => { ctx().actions.set_bitrate(kbps); return api.info() },
	// seek 는 보일 클립을 다시 고르지 않는다 — compose_effects 로 그 시각의 클립만 화면에(범위 밖 자막이 남지 않게)
	seek: async (t: number) => { const c = ctx(), tc = Math.max(0, t); c.actions.set_timecode(tc); await c.controllers.compositor.seek(tc, true); c.controllers.compositor.compose_effects(c.state.effects, tc); await sleep(80); return Math.round(c.state.timecode) },
	// 합성 화면 한 장(PNG) — 지금 시각의 프레임
	frame: async (t?: number) => {
		const c = ctx()
		if(t !== undefined && t !== null) await api.seek(t)
		const app = c.controllers.compositor.app
		app.render?.()
		const canvas: HTMLCanvasElement = app.view ?? app.canvas
		return (app.renderer?.extract ? await app.renderer.extract.base64(app.stage) : canvas.toDataURL("image/png")).split(",")[1]
	},
	undo: async () => { ctx().undo(); await redraw(); return api.info() },
	redo: async () => { ctx().redo(); await redraw(); return api.info() },
	// 내보내기 — 인코딩·다중화가 끝날 때까지(최대 timeoutMs) 기다려 mp4 를 돌려준다
	export: async (timeoutMs = 600000) => {
		const c = ctx(), s = c.state
		if(!s.effects.length) throw new Error("내보낼 클립이 없습니다")
		c.controllers.video_export.export_start(s, s.settings.bitrate)
		const t0 = Date.now()
		while(Date.now() - t0 < timeoutMs) {
			await sleep(250)
			if(c.state.export_status === "complete" && c.controllers.video_export.exported_file) break
			if(c.state.export_status === "error") throw new Error("내보내기 실패")
		}
		const f = c.controllers.video_export.exported_file
		if(!f) throw new Error(`내보내기 시간 초과(${timeoutMs}ms) — 상태 ${c.state.export_status}`)
		const out = await fileToB64(f)
		c.controllers.video_export.resetExporter(c.state)
		return {b64: out, ms: Date.now() - t0}
	},
}
for(const k of Object.keys(api) as (keyof typeof api)[]) {
	const f = api[k] as any
	;(api as any)[k] = (...a: any[]) => {
		try { const r = f(...a); return r && r.then ? r.catch((e: any) => { throw new Error(String(e?.message ?? e)) }) : r }
		catch(e: any) { throw new Error(String(e?.message ?? e)) }
	}
}
;(window as any).__video = api
