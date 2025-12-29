// 火山引擎 TTS 连接器配置
// 使用火山引擎豆包语音合成服务

import type { ConnectorField, CardDisplayField } from '../../core'

/** 资源 ID 选项 */
export const resourceIdOptions = [
  { value: 'seed-tts-1.0', label: '豆包语音合成 1.0 (字符版)' },
  { value: 'seed-tts-1.0-concurr', label: '豆包语音合成 1.0 (并发版)' },
  { value: 'seed-tts-2.0', label: '豆包语音合成 2.0 (字符版)' },
  { value: 'seed-icl-1.0', label: '声音复刻 1.0 (字符版)' },
  { value: 'seed-icl-1.0-concurr', label: '声音复刻 1.0 (并发版)' },
  { value: 'seed-icl-2.0', label: '声音复刻 2.0 (字符版)' }
]

// ===================== 豆包语音合成模型 2.0 音色 =====================
const tts2VoiceOptions = [
  { value: 'zh_female_vv_uranus_bigtts', label: 'Vivi 2.0 (女)', group: '2.0-通用' },
  { value: 'zh_female_xiaohe_uranus_bigtts', label: '小何 2.0 (女)', group: '2.0-通用' },
  { value: 'zh_male_m191_uranus_bigtts', label: '云舟 2.0 (男)', group: '2.0-通用' },
  { value: 'zh_male_taocheng_uranus_bigtts', label: '小天 2.0 (男)', group: '2.0-通用' }
]

// ===================== 精品音色 =====================
const premiumVoiceOptions = [
  { value: 'zh_female_xueayi_saturn_bigtts', label: '儿童绘本 (女)', group: '精品-有声阅读' },
  { value: 'zh_male_dayi_saturn_bigtts', label: '大壹 (男)', group: '精品-视频配音' },
  { value: 'zh_female_mizai_saturn_bigtts', label: '黑猫侦探社咪 (女)', group: '精品-视频配音' },
  { value: 'zh_female_jitangnv_saturn_bigtts', label: '鸡汤女 (女)', group: '精品-视频配音' },
  { value: 'zh_female_meilinvyou_saturn_bigtts', label: '魅力女友 (女)', group: '精品-视频配音' },
  { value: 'zh_female_santongyongns_saturn_bigtts', label: '流畅女声 (女)', group: '精品-视频配音' },
  { value: 'zh_male_ruyayichen_saturn_bigtts', label: '儒雅逸辰 (男)', group: '精品-视频配音' },
  { value: 'saturn_zh_female_keainvsheng_tob', label: '可爱女生 (女)', group: '精品-角色扮演' },
  { value: 'saturn_zh_female_tiaopigongzhu_tob', label: '调皮公主 (女)', group: '精品-角色扮演' },
  { value: 'saturn_zh_male_shuanglangshaonian_tob', label: '爽朗少年 (男)', group: '精品-角色扮演' },
  { value: 'saturn_zh_male_tiancaitongzhuo_tob', label: '天才同桌 (男)', group: '精品-角色扮演' },
  { value: 'saturn_zh_female_cancan_tob', label: '知性灿灿 (女)', group: '精品-角色扮演' }
]

// ===================== 多情感音色 =====================
const emotionalVoiceOptions = [
  // 中文多情感
  { value: 'zh_male_lengkugege_emo_v2_mars_bigtts', label: '冷酷哥哥-多情感 (男)', group: '多情感-中文' },
  { value: 'zh_female_tianxinxiaomei_emo_v2_mars_bigtts', label: '甜心小美-多情感 (女)', group: '多情感-中文' },
  { value: 'zh_female_gaolengyujie_emo_v2_mars_bigtts', label: '高冷御姐-多情感 (女)', group: '多情感-中文' },
  { value: 'zh_male_aojiaobazong_emo_v2_mars_bigtts', label: '傲娇霸总-多情感 (男)', group: '多情感-中文' },
  { value: 'zh_male_guangzhoudege_emo_mars_bigtts', label: '广州德哥-多情感 (男)', group: '多情感-中文' },
  { value: 'zh_male_jingqiangkanye_emo_mars_bigtts', label: '京腔侃爷-多情感 (男)', group: '多情感-中文' },
  { value: 'zh_female_linjuayi_emo_v2_mars_bigtts', label: '邻居阿姨-多情感 (女)', group: '多情感-中文' },
  { value: 'zh_male_yourougongzi_emo_v2_mars_bigtts', label: '优柔公子-多情感 (男)', group: '多情感-中文' },
  { value: 'zh_male_ruyayichen_emo_v2_mars_bigtts', label: '儒雅男友-多情感 (男)', group: '多情感-中文' },
  { value: 'zh_male_junlangnanyou_emo_v2_mars_bigtts', label: '俊朗男友-多情感 (男)', group: '多情感-中文' },
  { value: 'zh_male_beijingxiaoye_emo_v2_mars_bigtts', label: '北京小爷-多情感 (男)', group: '多情感-中文' },
  { value: 'zh_female_roumeinvyou_emo_v2_mars_bigtts', label: '柔美女友-多情感 (女)', group: '多情感-中文' },
  { value: 'zh_male_yangguangqingnian_emo_v2_mars_bigtts', label: '阳光青年-多情感 (男)', group: '多情感-中文' },
  { value: 'zh_female_meilinvyou_emo_v2_mars_bigtts', label: '魅力女友-多情感 (女)', group: '多情感-中文' },
  { value: 'zh_female_shuangkuaisisi_emo_v2_mars_bigtts', label: '爽快思思-多情感 (女)', group: '多情感-中文' },
  { value: 'zh_male_shenyeboke_emo_v2_mars_bigtts', label: '深夜播客-多情感 (男)', group: '多情感-中文' },
  // 英文多情感
  { value: 'en_female_candice_emo_v2_mars_bigtts', label: 'Candice-多情感 (女)', group: '多情感-英文' },
  { value: 'en_female_skye_emo_v2_mars_bigtts', label: 'Serena-多情感 (女)', group: '多情感-英文' },
  { value: 'en_male_glen_emo_v2_mars_bigtts', label: 'Glen-多情感 (男)', group: '多情感-英文' },
  { value: 'en_male_sylus_emo_v2_mars_bigtts', label: 'Sylus-多情感 (男)', group: '多情感-英文' },
  { value: 'en_male_corey_emo_v2_mars_bigtts', label: 'Corey-多情感 (男)', group: '多情感-英文' },
  { value: 'en_female_nadia_tips_emo_v2_mars_bigtts', label: 'Nadia-多情感 (女)', group: '多情感-英文' }
]

// ===================== 通用场景音色 =====================
const generalVoiceOptions = [
  { value: 'zh_female_vv_mars_bigtts', label: 'Vivi (女)', group: '通用' },
  { value: 'zh_female_qinqienvsheng_moon_bigtts', label: '亲切女声 (女)', group: '通用' },
  { value: 'zh_male_qingyiyuxuan_mars_bigtts', label: '阳光阿辰 (男)', group: '通用' },
  { value: 'zh_male_xudong_conversation_wvae_bigtts', label: '快乐小东 (男)', group: '通用' },
  { value: 'zh_female_linjianvhai_moon_bigtts', label: '邻家女孩 (女)', group: '通用' },
  { value: 'zh_male_yuanboxiaoshu_moon_bigtts', label: '渊博小叔 (男)', group: '通用' },
  { value: 'zh_male_yangguangqingnian_moon_bigtts', label: '阳光青年 (男)', group: '通用' },
  { value: 'zh_female_tianmeixiaoyuan_moon_bigtts', label: '甜美小源 (女)', group: '通用' },
  { value: 'zh_female_qingchezizi_moon_bigtts', label: '清澈梓梓 (女)', group: '通用' },
  { value: 'zh_male_jieshuoxiaoming_moon_bigtts', label: '解说小明 (男)', group: '通用' },
  { value: 'zh_female_kailangjiejie_moon_bigtts', label: '开朗姐姐 (女)', group: '通用' },
  { value: 'zh_male_linjiananhai_moon_bigtts', label: '邻家男孩 (男)', group: '通用' },
  { value: 'zh_female_tianmeiyueyue_moon_bigtts', label: '甜美悦悦 (女)', group: '通用' },
  { value: 'zh_female_xinlingjitang_moon_bigtts', label: '心灵鸡汤 (女)', group: '通用' },
  { value: 'zh_female_shuangkuaisisi_moon_bigtts', label: '爽快思思 (女)', group: '通用' },
  { value: 'zh_male_wennuanahu_moon_bigtts', label: '温暖阿虎 (男)', group: '通用' },
  { value: 'zh_male_shaonianzixin_moon_bigtts', label: '少年梓辛 (男)', group: '通用' },
  { value: 'zh_female_cancan_mars_bigtts', label: '灿灿 (女)', group: '通用' },
  { value: 'zh_male_wenrouxiaoge_mars_bigtts', label: '温柔小哥 (男)', group: '通用' },
  { value: 'zh_female_tianmeitaozi_mars_bigtts', label: '甜美桃子 (女)', group: '通用' },
  { value: 'zh_female_qingxinnvsheng_mars_bigtts', label: '清新女声 (女)', group: '通用' },
  { value: 'zh_female_zhixingnvsheng_mars_bigtts', label: '知性女声 (女)', group: '通用' },
  { value: 'zh_male_qingshuangnanda_mars_bigtts', label: '清爽男大 (男)', group: '通用' }
]

// ===================== 趣味口音音色 =====================
const accentVoiceOptions = [
  { value: 'zh_female_yueyunv_mars_bigtts', label: '粤语小溏 (女)', group: '口音' },
  { value: 'zh_male_yuzhouzixuan_moon_bigtts', label: '豫州子轩-河南 (男)', group: '口音' },
  { value: 'zh_female_daimengchuanmei_moon_bigtts', label: '呆萌川妹-四川 (女)', group: '口音' },
  { value: 'zh_male_guangxiyuanzhou_moon_bigtts', label: '广西远舟-广西 (男)', group: '口音' },
  { value: 'zh_male_zhoujielun_emo_v2_mars_bigtts', label: '双节棍小哥-台湾 (男)', group: '口音' },
  { value: 'zh_female_wanwanxiaohe_moon_bigtts', label: '湾湾小何-台湾 (女)', group: '口音' },
  { value: 'zh_female_wanqudashu_moon_bigtts', label: '湾区大叔-广东 (女)', group: '口音' },
  { value: 'zh_male_guozhoudege_moon_bigtts', label: '广州德哥-广东 (男)', group: '口音' },
  { value: 'zh_male_haoyuxiaoge_moon_bigtts', label: '浩宇小哥-青岛 (男)', group: '口音' },
  { value: 'zh_male_beijingxiaoye_moon_bigtts', label: '北京小爷-北京 (男)', group: '口音' },
  { value: 'zh_male_jingqiangkanye_moon_bigtts', label: '京腔侃爷-北京 (男)', group: '口音' },
  { value: 'zh_female_meituojieer_moon_bigtts', label: '妹坨洁儿-长沙 (女)', group: '口音' }
]

// ===================== 角色扮演音色 =====================
const roleplayVoiceOptions = [
  { value: 'zh_female_gaolengyujie_moon_bigtts', label: '高冷御姐 (女)', group: '角色扮演' },
  { value: 'zh_male_aojiaobazong_moon_bigtts', label: '傲娇霸总 (男)', group: '角色扮演' },
  { value: 'zh_female_meilinvyou_moon_bigtts', label: '魅力女友 (女)', group: '角色扮演' },
  { value: 'zh_male_shenyeboke_moon_bigtts', label: '深夜播客 (男)', group: '角色扮演' },
  { value: 'zh_female_sajiaonvyou_moon_bigtts', label: '柔美女友 (女)', group: '角色扮演' },
  { value: 'zh_female_yuanqinvyou_moon_bigtts', label: '撒娇学妹 (女)', group: '角色扮演' },
  { value: 'zh_male_dongfanghaoran_moon_bigtts', label: '东方浩然 (男)', group: '角色扮演' },
  { value: 'zh_male_naiqimengwa_mars_bigtts', label: '奶气萌娃 (男)', group: '角色扮演' },
  { value: 'zh_female_popo_mars_bigtts', label: '婆婆 (女)', group: '角色扮演' }
]

// ===================== IP 仿音音色 =====================
const ipVoiceOptions = [
  { value: 'zh_male_hupunan_mars_bigtts', label: '沪普男 (男)', group: 'IP仿音' },
  { value: 'zh_male_lubanqihao_mars_bigtts', label: '鲁班七号 (男)', group: 'IP仿音' },
  { value: 'zh_female_yangmi_mars_bigtts', label: '林潇 (女)', group: 'IP仿音' },
  { value: 'zh_female_linzhiling_mars_bigtts', label: '玲玲姐姐 (女)', group: 'IP仿音' },
  { value: 'zh_female_jiyejizi2_mars_bigtts', label: '春日部姐姐 (女)', group: 'IP仿音' },
  { value: 'zh_male_tangseng_mars_bigtts', label: '唐僧 (男)', group: 'IP仿音' },
  { value: 'zh_male_zhuangzhou_mars_bigtts', label: '庄周 (男)', group: 'IP仿音' },
  { value: 'zh_male_zhubajie_mars_bigtts', label: '猪八戒 (男)', group: 'IP仿音' },
  { value: 'zh_female_ganmaodianyin_mars_bigtts', label: '感冒电音姐姐 (女)', group: 'IP仿音' },
  { value: 'zh_female_naying_mars_bigtts', label: '直率英子 (女)', group: 'IP仿音' },
  { value: 'zh_female_leidian_mars_bigtts', label: '女雷神 (女)', group: 'IP仿音' }
]

// ===================== 视频配音音色 =====================
const videoDubbingVoiceOptions = [
  { value: 'zh_male_M100_conversation_wvae_bigtts', label: '悠悠君子 (男)', group: '视频配音' },
  { value: 'zh_female_maomao_conversation_wvae_bigtts', label: '文静毛毛 (女)', group: '视频配音' },
  { value: 'zh_female_wenrouxiaoya_moon_bigtts', label: '温柔小雅 (女)', group: '视频配音' },
  { value: 'zh_male_tiancaitongsheng_mars_bigtts', label: '天才童声 (男)', group: '视频配音' },
  { value: 'zh_male_sunwukong_mars_bigtts', label: '猴哥 (男)', group: '视频配音' },
  { value: 'zh_male_xionger_mars_bigtts', label: '熊二 (男)', group: '视频配音' },
  { value: 'zh_female_peiqi_mars_bigtts', label: '佩奇猪 (女)', group: '视频配音' },
  { value: 'zh_female_wuzetian_mars_bigtts', label: '武则天 (女)', group: '视频配音' },
  { value: 'zh_female_gujie_mars_bigtts', label: '顾姐 (女)', group: '视频配音' },
  { value: 'zh_female_yingtaowanzi_mars_bigtts', label: '樱桃丸子 (女)', group: '视频配音' },
  { value: 'zh_male_chunhui_mars_bigtts', label: '广告解说 (男)', group: '视频配音' },
  { value: 'zh_female_shaoergushi_mars_bigtts', label: '少儿故事 (女)', group: '视频配音' },
  { value: 'zh_male_silang_mars_bigtts', label: '四郎 (男)', group: '视频配音' },
  { value: 'zh_female_qiaopinvsheng_mars_bigtts', label: '俏皮女声 (女)', group: '视频配音' },
  { value: 'zh_male_jieshuonansheng_mars_bigtts', label: '磁性解说男声 (男)', group: '视频配音' },
  { value: 'zh_female_jitangmeimei_mars_bigtts', label: '鸡汤妹妹 (女)', group: '视频配音' },
  { value: 'zh_female_tiexinnvsheng_mars_bigtts', label: '贴心女声 (女)', group: '视频配音' },
  { value: 'zh_female_mengyatou_mars_bigtts', label: '萌丫头 (女)', group: '视频配音' }
]

// ===================== 有声阅读音色 =====================
const audiobookVoiceOptions = [
  { value: 'zh_male_changtianyi_mars_bigtts', label: '悬疑解说 (男)', group: '有声阅读' },
  { value: 'zh_male_ruyaqingnian_mars_bigtts', label: '儒雅青年 (男)', group: '有声阅读' },
  { value: 'zh_male_baqiqingshu_mars_bigtts', label: '霸气青叔 (男)', group: '有声阅读' },
  { value: 'zh_male_qingcang_mars_bigtts', label: '擎苍 (男)', group: '有声阅读' },
  { value: 'zh_male_yangguangqingnian_mars_bigtts', label: '活力小哥 (男)', group: '有声阅读' },
  { value: 'zh_female_gufengshaoyu_mars_bigtts', label: '古风少御 (女)', group: '有声阅读' },
  { value: 'zh_female_wenroushunv_mars_bigtts', label: '温柔淑女 (女)', group: '有声阅读' },
  { value: 'zh_male_fanjuanqingnian_mars_bigtts', label: '反卷青年 (男)', group: '有声阅读' }
]

// ===================== 多语种音色 =====================
const multilingualVoiceOptions = [
  // 美式英语
  { value: 'en_female_lauren_moon_bigtts', label: 'Lauren (女)', group: '美式英语' },
  { value: 'en_male_campaign_jamal_moon_bigtts', label: 'Energetic Male II (男)', group: '美式英语' },
  { value: 'en_male_chris_moon_bigtts', label: 'Gotham Hero (男)', group: '美式英语' },
  { value: 'en_female_product_darcie_moon_bigtts', label: 'Flirty Female (女)', group: '美式英语' },
  { value: 'en_female_emotional_moon_bigtts', label: 'Peaceful Female (女)', group: '美式英语' },
  { value: 'en_female_nara_moon_bigtts', label: 'Nara (女)', group: '美式英语' },
  { value: 'en_male_bruce_moon_bigtts', label: 'Bruce (男)', group: '美式英语' },
  { value: 'en_male_michael_moon_bigtts', label: 'Michael (男)', group: '美式英语' },
  { value: 'en_female_dacey_conversation_wvae_bigtts', label: 'Daisy (女)', group: '美式英语' },
  { value: 'en_male_charlie_conversation_wvae_bigtts', label: 'Owen (男)', group: '美式英语' },
  { value: 'en_female_sarah_new_conversation_wvae_bigtts', label: 'Luna (女)', group: '美式英语' },
  { value: 'en_male_adam_mars_bigtts', label: 'Adam (男)', group: '美式英语' },
  { value: 'en_female_amanda_mars_bigtts', label: 'Amanda (女)', group: '美式英语' },
  { value: 'en_male_jackson_mars_bigtts', label: 'Jackson (男)', group: '美式英语' },
  // 英式英语
  { value: 'en_female_daisy_moon_bigtts', label: 'Delicate Girl (女)', group: '英式英语' },
  { value: 'en_male_dave_moon_bigtts', label: 'Dave (男)', group: '英式英语' },
  { value: 'en_male_hades_moon_bigtts', label: 'Hades (男)', group: '英式英语' },
  { value: 'en_female_onez_moon_bigtts', label: 'Onez (女)', group: '英式英语' },
  { value: 'en_female_emily_mars_bigtts', label: 'Emily (女)', group: '英式英语' },
  { value: 'en_male_smith_mars_bigtts', label: 'Smith (男)', group: '英式英语' },
  { value: 'en_female_anna_mars_bigtts', label: 'Anna (女)', group: '英式英语' },
  // 澳洲英语
  { value: 'en_female_sarah_mars_bigtts', label: 'Sarah (女)', group: '澳洲英语' },
  { value: 'en_male_dryw_mars_bigtts', label: 'Dryw (男)', group: '澳洲英语' },
  // 日语
  { value: 'multi_zh_male_youyoujunzi_moon_bigtts', label: 'ひかる/光 (男)', group: '日语' },
  { value: 'multi_female_maomao_conversation_wvae_bigtts', label: 'つき/月 (女)', group: '日语' },
  { value: 'multi_female_gaolengyujie_moon_bigtts', label: 'あけみ/朱美 (女)', group: '日语' },
  { value: 'multi_female_shuangkuaisisi_moon_bigtts', label: 'はるこ/晴子 (女)', group: '日语' },
  { value: 'multi_male_jingqiangkanye_moon_bigtts', label: 'かずね/和音 (男)', group: '日语' },
  { value: 'multi_male_wanqudashu_moon_bigtts', label: 'ひろし/広志 (男)', group: '日语' },
  // 西语
  { value: 'multi_male_M100_conversation_wvae_bigtts', label: 'Lucía (男)', group: '西班牙语' }
]

// ===================== 教育场景音色 =====================
const educationVoiceOptions = [
  { value: 'zh_female_yingyujiaoyu_mars_bigtts', label: 'Tina老师 (女)', group: '教育' }
]

// ===================== 客服场景音色 =====================
const customerServiceVoiceOptions = [
  { value: 'ICL_zh_female_lixingyuanzi_cs_tob', label: '理性圆子 (女)', group: '客服' },
  { value: 'ICL_zh_female_qingtiantaotao_cs_tob', label: '清甜桃桃 (女)', group: '客服' },
  { value: 'ICL_zh_female_qingxixiaoxue_cs_tob', label: '清晰小雪 (女)', group: '客服' },
  { value: 'ICL_zh_female_qingtianmeimei_cs_tob', label: '清甜莓莓 (女)', group: '客服' },
  { value: 'ICL_zh_female_kailangtingting_cs_tob', label: '开朗婷婷 (女)', group: '客服' },
  { value: 'ICL_zh_male_qingxinmumu_cs_tob', label: '清新沐沐 (男)', group: '客服' },
  { value: 'ICL_zh_male_shuanglangxiaoyang_cs_tob', label: '爽朗小阳 (男)', group: '客服' },
  { value: 'zh_female_kefunvsheng_mars_bigtts', label: '暖阳女声 (女)', group: '客服' }
]

/** 所有音色选项 */
export const allVoiceOptions = [
  ...tts2VoiceOptions,
  ...premiumVoiceOptions,
  ...emotionalVoiceOptions,
  ...generalVoiceOptions,
  ...accentVoiceOptions,
  ...roleplayVoiceOptions,
  ...ipVoiceOptions,
  ...videoDubbingVoiceOptions,
  ...audiobookVoiceOptions,
  ...multilingualVoiceOptions,
  ...educationVoiceOptions,
  ...customerServiceVoiceOptions
]

/** 中文情感选项 */
export const chineseEmotionOptions = [
  { value: '', label: '默认' },
  { value: 'happy', label: '开心 (happy)' },
  { value: 'sad', label: '悲伤 (sad)' },
  { value: 'angry', label: '生气 (angry)' },
  { value: 'surprised', label: '惊讶 (surprised)' },
  { value: 'fear', label: '恐惧 (fear)' },
  { value: 'hate', label: '厌恶 (hate)' },
  { value: 'excited', label: '激动 (excited)' },
  { value: 'coldness', label: '冷漠 (coldness)' },
  { value: 'neutral', label: '中性 (neutral)' },
  { value: 'depressed', label: '沮丧 (depressed)' },
  { value: 'lovey-dovey', label: '撒娇 (lovey-dovey)' },
  { value: 'shy', label: '害羞 (shy)' },
  { value: 'comfort', label: '安慰鼓励 (comfort)' },
  { value: 'tension', label: '咆哮/焦急 (tension)' },
  { value: 'tender', label: '温柔 (tender)' },
  { value: 'storytelling', label: '讲故事 (storytelling)' },
  { value: 'radio', label: '情感电台 (radio)' },
  { value: 'magnetic', label: '磁性 (magnetic)' },
  { value: 'advertising', label: '广告营销 (advertising)' },
  { value: 'vocal-fry', label: '气泡音 (vocal-fry)' },
  { value: 'asmr', label: '低语/ASMR' },
  { value: 'news', label: '新闻播报 (news)' },
  { value: 'entertainment', label: '娱乐八卦 (entertainment)' },
  { value: 'dialect', label: '方言 (dialect)' }
]

/** 英文情感选项 */
export const englishEmotionOptions = [
  { value: '', label: '默认' },
  { value: 'neutral', label: '中性 (neutral)' },
  { value: 'happy', label: '愉悦 (happy)' },
  { value: 'angry', label: '愤怒 (angry)' },
  { value: 'sad', label: '悲伤 (sad)' },
  { value: 'excited', label: '兴奋 (excited)' },
  { value: 'chat', label: '对话/闲聊 (chat)' },
  { value: 'asmr', label: '低语/ASMR' },
  { value: 'warm', label: '温暖 (warm)' },
  { value: 'affectionate', label: '深情 (affectionate)' },
  { value: 'authoritative', label: '权威 (authoritative)' }
]

/** 情感选项 (合并) */
export const emotionOptions = [
  { value: '', label: '默认' },
  // 通用情感
  { value: 'neutral', label: '中性' },
  { value: 'happy', label: '开心/愉悦' },
  { value: 'sad', label: '悲伤' },
  { value: 'angry', label: '生气/愤怒' },
  { value: 'surprised', label: '惊讶' },
  { value: 'fear', label: '恐惧' },
  { value: 'hate', label: '厌恶' },
  { value: 'excited', label: '激动/兴奋' },
  { value: 'coldness', label: '冷漠' },
  { value: 'depressed', label: '沮丧' },
  // 中文特有
  { value: 'lovey-dovey', label: '撒娇' },
  { value: 'shy', label: '害羞' },
  { value: 'comfort', label: '安慰鼓励' },
  { value: 'tension', label: '咆哮/焦急' },
  { value: 'tender', label: '温柔' },
  { value: 'storytelling', label: '讲故事' },
  { value: 'radio', label: '情感电台' },
  { value: 'magnetic', label: '磁性' },
  { value: 'advertising', label: '广告营销' },
  { value: 'vocal-fry', label: '气泡音' },
  { value: 'news', label: '新闻播报' },
  { value: 'entertainment', label: '娱乐八卦' },
  // 英文特有
  { value: 'chat', label: '对话/闲聊' },
  { value: 'asmr', label: '低语/ASMR' },
  { value: 'warm', label: '温暖' },
  { value: 'affectionate', label: '深情' },
  { value: 'authoritative', label: '权威' }
]

/** 输出格式选项 */
export const formatOptions = [
  { value: 'mp3', label: 'MP3' },
  { value: 'ogg_opus', label: 'OGG Opus' },
  { value: 'pcm', label: 'PCM' }
]

/** 采样率选项 */
export const sampleRateOptions = [
  { value: '16000', label: '16000 Hz' },
  { value: '22050', label: '22050 Hz' },
  { value: '24000', label: '24000 Hz' },
  { value: '32000', label: '32000 Hz' },
  { value: '44100', label: '44100 Hz' },
  { value: '48000', label: '48000 Hz' }
]

/** 火山引擎 TTS 配置字段 */
export const connectorFields: ConnectorField[] = [
  {
    key: 'appId',
    label: 'App ID',
    type: 'text',
    required: true,
    placeholder: '火山引擎控制台获取的 App ID',
    description: '在 https://console.volcengine.com/speech/service/10035 获取'
  },
  {
    key: 'accessKey',
    label: 'Access Token',
    type: 'password',
    required: true,
    placeholder: '火山引擎控制台获取的 Access Token',
    description: '在 https://console.volcengine.com/speech/service/10035 获取'
  },
  {
    key: 'resourceId',
    label: '资源 ID',
    type: 'combobox',
    required: false,
    default: 'seed-tts-1.0',
    placeholder: '选择预设或输入自定义资源 ID',
    options: resourceIdOptions,
    description: '需要先在控制台开通对应模型，试用按钮就是开通。https://console.volcengine.com/speech/service/10035'
  },
  {
    key: 'speaker',
    label: '音色',
    type: 'combobox',
    required: false,
    default: 'zh_female_shuangkuaisisi_moon_bigtts',
    placeholder: '选择预设音色或输入音色 ID',
    options: allVoiceOptions,
    description: '发音人，支持自定义音色 ID。更多音色请参考火山引擎官方文档'
  },
  {
    key: 'emotion',
    label: '情感',
    type: 'combobox',
    required: false,
    default: '',
    placeholder: '选择情感或输入情感参数',
    options: emotionOptions,
    description: '仅部分多情感音色支持，不同音色支持的情感不同'
  },
  {
    key: 'speechRate',
    label: '语速',
    type: 'combobox',
    required: false,
    default: '0',
    placeholder: '0',
    options: [
      { value: '-50', label: '-50 (0.5x)' },
      { value: '-25', label: '-25' },
      { value: '0', label: '0 (正常)' },
      { value: '25', label: '+25' },
      { value: '50', label: '+50' },
      { value: '100', label: '+100 (2x)' }
    ],
    description: '语速调整，范围 -50 到 100'
  },
  {
    key: 'format',
    label: '输出格式',
    type: 'select',
    required: false,
    default: 'mp3',
    options: formatOptions,
    description: '音频编码格式'
  },
  {
    key: 'sampleRate',
    label: '采样率',
    type: 'select',
    required: false,
    default: '24000',
    options: sampleRateOptions,
    description: '音频采样率'
  },
  {
    key: 'explicitLanguage',
    label: '指定语言',
    type: 'select',
    required: false,
    default: '',
    options: [
      { value: '', label: '自动检测' },
      { value: 'zh', label: '中文' },
      { value: 'en', label: '英文' },
      { value: 'ja', label: '日语' },
      { value: 'es', label: '西班牙语' }
    ],
    description: '强制指定合成语言，不指定则自动检测'
  },
  {
    key: 'disableMarkdownFilter',
    label: '禁用 Markdown 过滤',
    type: 'boolean',
    required: false,
    default: true,
    description: '禁用文本中的 Markdown 语法过滤'
  },
  {
    key: 'enableTimestamp',
    label: '启用时间戳',
    type: 'boolean',
    required: false,
    default: false,
    description: '启用后返回每个句子的时间戳信息'
  }
]

/** 卡片展示字段 */
export const connectorCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'speaker', label: '音色' }
]
