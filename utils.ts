export function generateHumanReadableAuthors(names: string[]) {
  if (names.length === 0) {
    return undefined
  } else if (names.length === 1) {
    return names[0]
  } else {
    const last = names.pop()
    return `${names.join(', ')} in ${last}`
  }
}

export function getLastName(name: string) {
  const parts = name.split(' ')
  return parts[parts.length - 1]
}

export function convertBytesToSeconds(bytes: number, bitrate = 320) {
  const kilobytes = bytes / 1000
  const kilobits = kilobytes * 8
  const seconds = kilobits / bitrate // MP3 bitrate is in kilobits/second

  return Math.round(seconds)
}
