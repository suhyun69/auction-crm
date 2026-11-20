"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { FlowCall, FlowLane, FlowNode } from "@/lib/flow/traffic";

export type View = { rx: number; rz: number };
export const DEFAULT_VIEW: View = { rx: 52, rz: -14 };
export type ActivePacket = { id: string; call: FlowCall; delayMs: number };
export type NodeInfo = { title: string; lines: string[]; dimmed?: boolean };

const WORLD = { width: 560, depth: 520 };
export const TRAVEL_MS = 820;
const LANE_Z = 22;
type Box = { x: number; y: number; w: number; d: number; h: number };
// 원본 그림 배치: 위에 넓은 API, 왼쪽 가운데 엔진, 오른쪽 아래 Web.
const BOXES: Record<FlowNode, Box> = {
  api: { x: 20, y: 20, w: 520, d: 110, h: 44 },
  engine: { x: 30, y: 280, w: 230, d: 110, h: 44 },
  web: { x: 300, y: 390, w: 230, d: 110, h: 44 },
};
const LANES: Record<FlowLane, { x: number; from: number; to: number; label: string }> = {
  "engine-api": { x: 124, from: 280, to: 130, label: "요청" },
  "api-engine": { x: 166, from: 130, to: 280, label: "응답" },
  "api-web": { x: 394, from: 130, to: 390, label: "SSE·응답" },
  "web-api": { x: 436, from: 390, to: 130, label: "재조회" },
};
const ORDER: FlowNode[] = ["api", "engine", "web"];
const NODE_NAMES: Record<FlowNode, string> = { api: "API", engine: "Simulation Engine", web: "Web" };

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

type Props = {
  view: View;
  onView: (view: View) => void;
  nodes: Record<FlowNode, NodeInfo>;
  selected: FlowNode | null;
  onSelect: (node: FlowNode | null) => void;
  packets: ActivePacket[];
  paused: boolean;
  reducedMotion: boolean;
  onPacketDone: (id: string) => void;
  idleLanes: FlowLane[];
  badges: Partial<Record<FlowLane, number>>;
  /** 차선 이름을 바꿀 때(예: graphql 모드의 "구독·응답") */
  laneLabels?: Partial<Record<FlowLane, string>>;
};

export function FlowScene({ view, onView, nodes, selected, onSelect, packets, paused, reducedMotion, onPacketDone, idleLanes, badges, laneLabels = {} }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean; pointer: number } | null>(null);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // 돌린 바닥은 원래 폭보다 넓어지고 기울면 세로로 짧아지므로 폭은 넉넉히, 높이는 덜 엄격하게 본다.
      setScale(clamp(Math.min(width / 680, height / 470), .4, 1.25));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, view, moved: false, pointer: event.pointerId };
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    // 작은 움직임은 노드 선택 클릭으로 남긴다. 넘어서면 회전으로 보고 포인터를 붙잡는다.
    if (!current.moved && Math.hypot(dx, dy) < 5) return;
    if (!current.moved) { current.moved = true; stage.current?.setPointerCapture(event.pointerId); }
    onView({ rz: current.view.rz + dx * .35, rx: clamp(current.view.rx - dy * .3, 8, 78) });
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.moved) stage.current?.releasePointerCapture(event.pointerId);
    drag.current = null;
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 15 : 5;
    const next = { ...view };
    if (event.key === "ArrowLeft") next.rz -= step;
    else if (event.key === "ArrowRight") next.rz += step;
    else if (event.key === "ArrowUp") next.rx = clamp(view.rx - step, 8, 78);
    else if (event.key === "ArrowDown") next.rx = clamp(view.rx + step, 8, 78);
    else return;
    event.preventDefault();
    onView(next);
  }

  const worldStyle = {
    width: WORLD.width, height: WORLD.depth, marginLeft: -WORLD.width / 2, marginTop: -WORLD.depth / 2 + 20,
    transform: `scale(${scale}) rotateX(${view.rx}deg) rotateZ(${view.rz}deg)`,
    "--billboard": `rotateZ(${-view.rz}deg) rotateX(${-view.rx}deg)`,
  } as CSSProperties;

  return (
    <div ref={stage} className="flow-stage" tabIndex={0} role="group"
      aria-label="호출 흐름 입체 화면. 드래그하거나 방향키로 돌려볼 수 있습니다."
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onKeyDown={keyDown}>
      <div className="flow-world" style={worldStyle}>
        <div className="flow-floor" aria-hidden="true" onClick={() => onSelect(null)} />
        {(Object.keys(LANES) as FlowLane[]).map(lane => {
          const { x, from, to } = LANES[lane];
          const label = laneLabels[lane] ?? LANES[lane].label;
          const up = to < from;
          const badge = badges[lane];
          return <div key={lane} aria-hidden="true">
            <div className={`flow-lane lane-${lane} ${up ? "is-up" : "is-down"} ${idleLanes.includes(lane) ? "is-idle" : ""}`}
              style={{ left: x - 2, top: Math.min(from, to), height: Math.abs(to - from), transform: `translateZ(${LANE_Z}px)` }} />
            <div className="flow-anchor" style={{ transform: `translate3d(${x + (up ? -10 : 10)}px, ${(from + to) / 2}px, ${LANE_Z + 6}px)` }}>
              <span className={`billboard flow-lane-label ${up ? "is-left" : "is-right"}`}>{label}{badge ? <b>+{badge}</b> : null}</span>
            </div>
          </div>;
        })}
        {ORDER.map(node => {
          const box = BOXES[node];
          const info = nodes[node];
          const isSelected = selected === node;
          return <div key={node} className={`flow-node node-${node} ${isSelected ? "is-selected" : ""} ${info.dimmed ? "is-dimmed" : ""}`}
            style={{ left: box.x, top: box.y, width: box.w, height: box.d, "--h": `${box.h}px` } as CSSProperties}>
            <div className="face face-back" /><div className="face face-left" /><div className="face face-right" /><div className="face face-front" />
            <button type="button" className="face face-top" aria-pressed={isSelected}
              aria-label={`${NODE_NAMES[node]} 선택. ${info.lines.join(", ")}`}
              onClick={() => onSelect(isSelected ? null : node)}>
              <strong>{info.title}</strong>
              {info.lines.map(line => <span key={line}>{line}</span>)}
            </button>
          </div>;
        })}
        {packets.map(packet => <Packet key={packet.id} packet={packet} paused={paused} reducedMotion={reducedMotion} onDone={onPacketDone} />)}
      </div>
    </div>
  );
}

function packetClass(call: FlowCall) {
  if (call.outcome === "ERROR" || call.outcome === "ABORTED") return "packet-error";
  if (call.kind === "bid") return call.direction === "request" ? "packet-bid" : call.outcome === "ACCEPTED" ? "packet-accepted" : "packet-rejected";
  if (call.kind === "sse") return "packet-sse";
  if (call.kind === "refresh") return "packet-refresh";
  return "packet-read";
}

function Packet({ packet, paused, reducedMotion, onDone }: { packet: ActivePacket; paused: boolean; reducedMotion: boolean; onDone: (id: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);

  useEffect(() => {
    const node = element.current;
    const core = node?.firstElementChild;
    if (!node || !core) return;
    const lane = LANES[packet.call.lane];
    const at = (y: number) => `translate3d(${lane.x}px, ${y}px, ${LANE_Z}px)`;
    const timing = { delay: packet.delayMs, fill: "both" as const };
    // 투명도는 안쪽 구슬에만 건다. 3D 부모에 투명도를 주면 자식이 평면으로 눌린다.
    const list = reducedMotion
      // 동작 줄이기에서는 이동 없이 도착 지점에서만 잠깐 깜빡인다.
      ? [node.animate([{ transform: at(lane.to) }, { transform: at(lane.to) }], { ...timing, duration: 700 }),
         core.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { ...timing, duration: 700 })]
      : [node.animate([{ transform: at(lane.from) }, { transform: at(lane.to) }], { ...timing, duration: TRAVEL_MS, easing: "cubic-bezier(.45,.05,.4,1)" }),
         core.animate([{ opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 1, offset: .85 }, { opacity: 0 }], { ...timing, duration: TRAVEL_MS })];
    animations.current = list;
    list[0].onfinish = () => onDone(packet.id);
    return () => { for (const animation of list) animation.cancel(); };
  }, [packet, reducedMotion, onDone]);

  useEffect(() => {
    for (const animation of animations.current) {
      if (paused) animation.pause(); else animation.play();
    }
  }, [paused]);

  return <div ref={element} className="flow-packet" aria-hidden="true">
    <span className={`billboard packet-core ${packetClass(packet.call)}`} />
  </div>;
}
