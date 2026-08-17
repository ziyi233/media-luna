import type { MiddlewareDefinition, MiddlewareRunStatus, FileData } from '../../core'
import type { CharacterProfileService, CharacterProfileData } from './service'

export function createCharacterProfileMiddleware(): MiddlewareDefinition {
  return {
    name: 'character-profile',
    displayName: '角色设定集替换',
    description: '按用户设定集自动扩展提示词并注入设定图',
    category: 'transform',
    phase: 'lifecycle-pre-request',

    async execute(context, next): Promise<MiddlewareRunStatus> {
      const service = context.getService<CharacterProfileService>('character-profile')
      if (!service || context.uid == null || !context.prompt?.trim()) {
        return next()
      }

      const originalPrompt = context.prompt
      const originalFileCount = context.files.length
      const profileLogger = context.ctx.logger('media-luna/character-profile')

      const resolved = await service.expandPromptWithProfiles(
        context.uid,
        context.prompt,
        context.files,
        {
          debug: (message: string, ...args: any[]) => profileLogger.debug(message, ...args)
        }
      )

      const promptChanged = resolved.prompt !== originalPrompt
      const injectedImages = Math.max(0, resolved.files.length - originalFileCount)

      if (!promptChanged && resolved.matchedProfiles.length === 0 && injectedImages === 0) {
        return next()
      }

      context.prompt = resolved.prompt
      if (injectedImages > 0) {
        context.files = resolved.files
      }

      if (resolved.matchedProfiles.length > 0 || promptChanged) {
        context.setMiddlewareLog('character-profile', {
          originalPrompt,
          transformedPrompt: resolved.prompt,
          matchedProfiles: resolved.matchedProfiles.map((profile: CharacterProfileData) => ({
            id: profile.id,
            name: profile.name,
            imageCount: profile.imageUrls.length
          })),
          injectedImages
        })
      }

      if (resolved.matchedProfiles.length > 0) {
        context.addUserHint(`已注入设定集：${resolved.matchedProfiles.map((profile: CharacterProfileData) => profile.name).join('、')}`, 'before')
      }

      return next()
    }
  }
}
