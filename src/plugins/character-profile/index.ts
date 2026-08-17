import { definePlugin } from '../../core'
import { CharacterProfileService } from './service'
import { createCharacterProfileMiddleware } from './middleware'
import { characterProfileConfigFields, defaultCharacterProfileConfig, type CharacterProfileConfig } from './config'
import type { CacheService } from '../cache/service'

export default definePlugin({
  id: 'character-profile',
  name: '角色设定集',
  description: '为每个用户管理可复用的角色设定文本与设定图',
  version: '1.0.0',

  configFields: characterProfileConfigFields,
  configDefaults: defaultCharacterProfileConfig,

  services: [
    {
      name: 'character-profile',
      factory: (ctx) => new CharacterProfileService(
        ctx.ctx,
        () => ctx.getConfig<CharacterProfileConfig>(),
        () => ctx.getService<CacheService>('cache')
      )
    }
  ],

  middlewares: [
    createCharacterProfileMiddleware()
  ],

  async onLoad(ctx) {
    ctx.logger.info('Character profile plugin loaded')
  }
})

export { CharacterProfileService }
export type { CharacterProfileData, ExpandedCharacterProfile } from './service'
export type { CharacterProfileConfig } from './config'
