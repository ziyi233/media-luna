export function normalizeCommandParameters(options?: Record<string, any>): Record<string, any> {
  const parameters = { ...(options || {}) }

  if (parameters.duration == null) {
    parameters.duration = parameters.time ?? parameters.seconds ?? parameters.videoDurationSeconds
  }
  if (parameters.fps == null) {
    parameters.fps = parameters.framerate
  }

  delete parameters.image
  delete parameters.video
  delete parameters.time
  delete parameters.seconds
  delete parameters.framerate

  for (const key of Object.keys(parameters)) {
    if (parameters[key] == null) delete parameters[key]
  }

  return parameters
}
