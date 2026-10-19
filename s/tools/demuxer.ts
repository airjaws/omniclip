import {WebDemuxer} from "web-demuxer/dist/web-demuxer.js"

export async function demuxer(
	file: File,
	encoderWorker: Worker,
	onConfig: (config: VideoDecoderConfig) => void,
	onChunk: (chunk: EncodedVideoChunk) => void,
	start?: number,
	end?: number
) {
	let queue = 0
	const webdemuxer = new WebDemuxer({
		// ⚠️ you need to put the dist/wasm-files file in the npm package into a static directory like public
		// making sure that the js and wasm in wasm-files are in the same directory
		// devstudio 포팅: CDN(1.0.5 로더) 대신 설치된 라이브러리(web-demuxer 1.0.1)와 같은 판의 로컬 로더 — 133 인터넷 없이
		wasmLoaderPath: `${window.location.origin}/node_modules/web-demuxer/dist/wasm-files/ffmpeg.js`,
	})
	await webdemuxer.load(file)
	const config = await webdemuxer.getVideoDecoderConfig()
	onConfig(config)
	/*
		* starting demuxing one second sooner because sometimes demuxer
		* starts demuxing from keyframe that is too far ahead from effect.start
		* causing rendering to be stuck because of too few frames,
		* also ending demuxing one second later just in case too
	*/
	const oneSecondOffset = 1000
	const reader = webdemuxer.readAVPacket(start ? (start - oneSecondOffset) / 1000 : undefined, end ? (end + oneSecondOffset) / 1000 : undefined).getReader()

	encoderWorker.addEventListener("message", (msg) => {
		if(msg.data.action === "dequeue") {
			queue = msg.data.size
		}
	})

	reader.read().then(async function processAVPacket({ done, value }): Promise<any> {
		if (done) {return}
		const delay = calculateDynamicDelay(queue)
		const videoChunk = webdemuxer.genEncodedVideoChunk(value)
		onChunk(videoChunk)
		await sleep(delay)
		return await reader.read().then(processAVPacket)
	})
}

	function calculateDynamicDelay(queueSize: number) {
		const queueLimit = 500
		const maxDelay = 100 // Maximum delay in milliseconds
		const minDelay = 0   // Minimum delay in milliseconds
		const delay = (queueSize / queueLimit) * maxDelay;
		return Math.min(maxDelay, Math.max(minDelay, delay));
	}

	function sleep(ms: number) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

