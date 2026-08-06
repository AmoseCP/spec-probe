// jsdom 没有 WebGL 实现，调用 getContext 会打印 "Not implemented" 噪音。
// 这里给出与"浏览器禁用 WebGL"一致的行为（返回 null），需要假上下文的用例自行 spyOn 覆盖。
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}
