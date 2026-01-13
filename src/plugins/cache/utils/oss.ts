// 阿里云 OSS 工具模块
// 阿里云对象存储服务的上传工具函数

import { createHash, createHmac } from 'crypto'

/** 阿里云 OSS 配置接口 */
export interface OSSConfig {
  /** OSS 端点（如 oss-cn-hangzhou.aliyuncs.com） */
  endpoint?: string
  /** 区域（如 cn-hangzhou），也可从 endpoint 自动解析 */
  region?: string
  /** AccessKey ID */
  accessKeyId?: string
  /** AccessKey Secret */
  accessKeySecret?: string
  /** Bucket 名称 */
  bucket?: string
  /** 公开访问 URL 前缀（用于生成可访问链接） */
  publicBaseUrl?: string
  /** 是否使用自定义域名（CNAME） */
  cname?: boolean
  /** 访问控制策略 */
  acl?: 'private' | 'public-read' | 'public-read-write'
}

/** 获取 GMT 格式日期 */
function getGMTDate(): string {
  return new Date().toUTCString()
}

/** 计算 HMAC-SHA1 并返回 Base64 */
function hmacSha1Base64(key: string, data: string): string {
  return createHmac('sha1', key).update(data, 'utf8').digest('base64')
}

/** 计算 MD5 并返回 Base64 */
function md5Base64(data: Buffer): string {
  return createHash('md5').update(data).digest('base64')
}

/** URI 编码（符合 OSS 规范） */
function ossEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
}

/**
 * 构建 OSS 请求 URL 和 Host
 */
function buildOSSUrl(
  config: OSSConfig,
  objectKey: string
): { url: string; host: string; resource: string } {
  const bucket = config.bucket!
  let endpoint = config.endpoint || ''

  // 如果 endpoint 不包含协议，添加 https
  if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    endpoint = `https://${endpoint}`
  }

  const endpointUrl = new URL(endpoint)
  const hostname = endpointUrl.hostname
  const protocol = endpointUrl.protocol

  // 对 object key 进行编码
  const encodedKey = objectKey.split('/').map(ossEncode).join('/')

  let host: string
  let url: string
  let resource: string

  if (config.cname) {
    // 使用自定义域名
    host = hostname
    url = `${protocol}//${host}/${encodedKey}`
    resource = `/${bucket}/${objectKey}`
  } else {
    // 标准模式：bucket.endpoint
    host = `${bucket}.${hostname}`
    url = `${protocol}//${host}/${encodedKey}`
    resource = `/${bucket}/${objectKey}`
  }

  return { url, host, resource }
}

/**
 * 构建 OSS 签名（V1 签名）
 */
function buildOSSSignature(
  accessKeySecret: string,
  method: string,
  contentMd5: string,
  contentType: string,
  date: string,
  ossHeaders: Record<string, string>,
  resource: string
): string {
  // 构建 CanonicalizedOSSHeaders
  const sortedHeaders = Object.keys(ossHeaders)
    .filter(k => k.toLowerCase().startsWith('x-oss-'))
    .sort()

  const canonicalizedOSSHeaders = sortedHeaders
    .map(k => `${k.toLowerCase()}:${ossHeaders[k]}`)
    .join('\n')

  // 构建待签名字符串
  const stringToSign = [
    method,
    contentMd5,
    contentType,
    date,
    canonicalizedOSSHeaders ? canonicalizedOSSHeaders + '\n' + resource : resource
  ].join('\n')

  return hmacSha1Base64(accessKeySecret, stringToSign)
}

/**
 * 上传文件到阿里云 OSS
 */
export async function uploadToOSS(
  buffer: Buffer,
  filename: string,
  mime: string,
  config: OSSConfig
): Promise<{ url: string; key: string }> {
  const bucket = config.bucket
  const accessKeyId = config.accessKeyId
  const accessKeySecret = config.accessKeySecret

  if (!bucket) throw new Error('OSS 缺少 bucket 配置')
  if (!accessKeyId || !accessKeySecret) throw new Error('OSS 需提供 AccessKey ID 和 Secret')
  if (!config.endpoint) throw new Error('OSS 缺少 endpoint 配置')

  const objectKey = filename
  const { url, host, resource } = buildOSSUrl(config, objectKey)

  // 请求头
  const date = getGMTDate()
  const contentMd5 = md5Base64(buffer)
  const contentType = mime || 'application/octet-stream'

  const ossHeaders: Record<string, string> = {}

  // 添加 ACL（如果配置）
  if (config.acl) {
    ossHeaders['x-oss-object-acl'] = config.acl
  }

  // 计算签名
  const signature = buildOSSSignature(
    accessKeySecret,
    'PUT',
    contentMd5,
    contentType,
    date,
    ossHeaders,
    resource
  )

  // 构建请求头
  const headers: Record<string, string> = {
    'Host': host,
    'Date': date,
    'Content-Type': contentType,
    'Content-Length': buffer.length.toString(),
    'Content-MD5': contentMd5,
    'Authorization': `OSS ${accessKeyId}:${signature}`,
    ...ossHeaders
  }

  // 发送请求
  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: new Uint8Array(buffer)
  })

  if (!response.ok) {
    let errorDetail = ''
    try {
      const text = await response.text()
      // 尝试从 XML 中提取错误信息
      const codeMatch = text.match(/<Code>([^<]+)<\/Code>/)
      const msgMatch = text.match(/<Message>([^<]+)<\/Message>/)
      if (codeMatch || msgMatch) {
        errorDetail = ` [${codeMatch?.[1] || ''}] ${msgMatch?.[1] || ''}`
      } else if (text.length < 200) {
        errorDetail = ` ${text}`
      }
    } catch {
      // 忽略解析错误
    }
    throw new Error(`OSS 上传失败: ${response.status}${errorDetail}`)
  }

  // 构建公开访问 URL
  const publicUrl = config.publicBaseUrl
    ? `${config.publicBaseUrl.replace(/\/$/, '')}/${objectKey.split('/').map(ossEncode).join('/')}`
    : url

  return { url: publicUrl, key: objectKey }
}

/**
 * 从阿里云 OSS 删除文件
 */
export async function deleteFromOSS(
  objectKey: string,
  config: OSSConfig
): Promise<void> {
  const bucket = config.bucket
  const accessKeyId = config.accessKeyId
  const accessKeySecret = config.accessKeySecret

  if (!bucket || !accessKeyId || !accessKeySecret || !config.endpoint) return

  const { url, host, resource } = buildOSSUrl(config, objectKey)

  const date = getGMTDate()

  // 计算签名
  const signature = buildOSSSignature(
    accessKeySecret,
    'DELETE',
    '',
    '',
    date,
    {},
    resource
  )

  const headers: Record<string, string> = {
    'Host': host,
    'Date': date,
    'Authorization': `OSS ${accessKeyId}:${signature}`
  }

  await fetch(url, {
    method: 'DELETE',
    headers
  })
}
