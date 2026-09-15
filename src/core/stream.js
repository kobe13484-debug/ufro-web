const asNonNegativeFinite = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, number);
};

export function createStream({ flow = 0, tds = 0, ...metadata } = {}) {
  return {
    ...metadata,
    flow: asNonNegativeFinite(flow),
    tds: asNonNegativeFinite(tds),
  };
}

export function mixStreams(streams = []) {
  const normalized = streams.map((stream) => createStream(stream));
  const flow = normalized.reduce((sum, stream) => sum + stream.flow, 0);
  if (flow <= 0) return createStream();

  const soluteLoad = normalized.reduce(
    (sum, stream) => sum + stream.flow * stream.tds,
    0,
  );
  return createStream({ flow, tds: soluteLoad / flow });
}
