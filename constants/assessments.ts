export interface ScaleLabel {
  en: string;
  zh: string;
}

export interface AssessmentItem {
  item_number: number;
  text_en: string;
  text_zh: string;
  subscale?: string;
  tone?: 'positive' | 'negative';
  scale_labels?: Record<string, ScaleLabel>;
}

export interface AssessmentDomainItem {
  item_number: number;
  text_en: string;
  text_zh: string;
  scale_labels?: Record<string, ScaleLabel>;
}

export interface AssessmentDomain {
  domain_id: string;
  name_en: string;
  name_zh: string;
  scale_labels?: Record<string, ScaleLabel>;
  items: AssessmentDomainItem[];
}

export interface FOISItem {
  level: number;
  category_en: string;
  category_zh: string;
  text_en: string;
  text_zh: string;
}

export interface FDA2Section {
  section_number: number;
  name_en: string;
  name_zh: string;
  items: { item_id: string; text_en: string; text_zh: string }[];
}

export interface DToMsDimension {
  dimension_id: string;
  name_en: string;
  name_zh: string;
  description_en: string;
  description_zh: string;
  levels: { score: number; label_en: string; label_zh: string }[];
}

export interface MCASection {
  section_id: string;
  name_en: string;
  name_zh: string;
  description_en: string;
  description_zh: string;
  items: MCAItem[];
}

export interface MCAItem {
  item_id: string;
  text_en?: string;
  text_zh?: string;
  category_en?: string;
  category_zh?: string;
  response_type?: 'yes_no' | 'yes_no_detail' | 'text';
  scores?: Record<string, { en: string; zh: string }>;
}

export interface OHATItem {
  item_number: number;
  category_en: string;
  category_zh: string;
  category_ko?: string;
  scores: Record<string, { en: string; zh: string; ko?: string }>;
}

export interface BeckmanStructure {
  structure_id: string;
  name_en: string;
  name_zh: string;
  assessment_areas: BeckmanArea[];
}

export interface BeckmanArea {
  area_id: string;
  name_en: string;
  name_zh: string;
  items: BeckmanAreaItem[];
}

export interface BeckmanAreaItem {
  item_id: string;
  text_en: string;
  text_zh: string;
  max_score?: number;
  score_note_en?: string;
}

export interface BeckmanAdditionalObs {
  name_en: string;
  name_zh: string;
  items: { item_id: string; text_en: string; text_zh: string }[];
}

export interface AssessmentTool {
  id: string;
  name_en: string;
  name_zh: string;
  description_en: string;
  description_zh: string;
  reference: string;
  type: 'patient_self_report' | 'clinician_rated';
  scoring_method: string;
  scale_min?: number;
  scale_max?: number;
  scale_labels?: Record<string, ScaleLabel>;
  total_min?: number;
  total_max?: number;
  cutoff?: number;
  interpretation_en?: string;
  interpretation_zh?: string;
  items?: AssessmentItem[];
  domains?: AssessmentDomain[];
  fois_items?: FOISItem[];
  fda2_sections?: FDA2Section[];
  fda2_scale?: Record<string, ScaleLabel>;
  dtoms_dimensions?: DToMsDimension[];
  subscales?: Record<string, { items: number[]; max: number }>;
  severity_question?: {
    text_en: string;
    text_zh: string;
    scale_min: number;
    scale_max: number;
  };
  mca_sections?: MCASection[];
  risk_pathways?: Record<string, { en: string; zh: string }>;
  ohat_items?: OHATItem[];
  beckman_structures?: BeckmanStructure[];
  beckman_additional?: BeckmanAdditionalObs;
}

export const ASSESSMENT_TOOLS: Record<string, AssessmentTool> = {
  eat_10: {
    id: 'eat_10',
    name_en: 'Eating Assessment Tool (EAT-10)',
    name_zh: '進食評估工具 (EAT-10)',
    description_en: 'A self-administered, symptom-specific screening tool for dysphagia and aspiration risk.',
    description_zh: '一份自我填寫的吞嚥困難及誤吸風險篩查工具。',
    reference: 'Belafsky et al. (2008)',
    type: 'patient_self_report',
    scoring_method: 'summation',
    scale_min: 0,
    scale_max: 4,
    scale_labels: {
      '0': { en: 'No problem', zh: '沒有問題' },
      '1': { en: 'Mild problem', zh: '輕微問題' },
      '2': { en: 'Moderate problem', zh: '中度問題' },
      '3': { en: 'Marked problem', zh: '明顯問題' },
      '4': { en: 'Severe problem', zh: '嚴重問題' },
    },
    total_min: 0,
    total_max: 40,
    cutoff: 3,
    interpretation_en: 'A score of 3 or higher indicates the person may have problems swallowing efficiently and safely. A score of 15 or higher indicates 2.2 times greater likelihood of aspiration.',
    interpretation_zh: '總分3分或以上表示患者可能有吞嚥效率及安全方面的問題。總分15分或以上表示誤吸風險增加2.2倍。',
    items: [
      { item_number: 1, text_en: 'My swallowing problem has caused me to lose weight.', text_zh: '我的吞嚥問題導致我體重減輕。' },
      { item_number: 2, text_en: 'My swallowing problem interferes with my ability to go out for meals.', text_zh: '我的吞嚥問題影響了我外出用餐的能力。' },
      { item_number: 3, text_en: 'Swallowing liquids takes extra effort.', text_zh: '吞嚥液體需要額外的努力。' },
      { item_number: 4, text_en: 'Swallowing solids takes extra effort.', text_zh: '吞嚥固體食物需要額外的努力。' },
      { item_number: 5, text_en: 'Swallowing pills takes extra effort.', text_zh: '吞服藥丸需要額外的努力。' },
      { item_number: 6, text_en: 'Swallowing is painful.', text_zh: '吞嚥時感到疼痛。' },
      { item_number: 7, text_en: 'The pleasure of eating is affected by my swallowing.', text_zh: '我的吞嚥問題影響了進食的樂趣。' },
      { item_number: 8, text_en: 'When I swallow food sticks in my throat.', text_zh: '吞嚥時食物會卡在喉嚨裡。' },
      { item_number: 9, text_en: 'I cough when I eat.', text_zh: '我進食時會咳嗽。' },
      { item_number: 10, text_en: 'Swallowing is stressful.', text_zh: '吞嚥令我感到有壓力。' },
    ],
  },
  dhi: {
    id: 'dhi',
    name_en: 'Dysphagia Handicap Index (DHI)',
    name_zh: '吞嚥障礙殘障指數 (DHI)',
    description_en: 'A 25-item self-administered questionnaire measuring the handicapping effect of dysphagia.',
    description_zh: '一份25題的自我填寫問卷，評估吞嚥困難對情緒、功能及身體方面的影響。',
    reference: 'Silbergleit et al. (2012)',
    type: 'patient_self_report',
    scoring_method: 'dhi',
    scale_labels: {
      '0': { en: 'Never', zh: '從不' },
      '2': { en: 'Sometimes', zh: '有時' },
      '4': { en: 'Always', zh: '總是' },
    },
    total_min: 0,
    total_max: 100,
    interpretation_en: 'Higher scores indicate greater perceived handicap from dysphagia.',
    interpretation_zh: '分數越高表示吞嚥困難造成的障礙感越大。',
    subscales: {
      physical: { items: [1, 2, 3, 4, 5, 6, 7, 8, 9], max: 36 },
      functional: { items: [10, 11, 12, 13, 14, 15, 16, 17, 18], max: 36 },
      emotional: { items: [19, 20, 21, 22, 23, 24, 25], max: 28 },
    },
    severity_question: {
      text_en: 'On a scale of 1-7, please rate the severity of your swallowing difficulty (1 = normal swallowing, 4 = moderate, 7 = severe).',
      text_zh: '請用1-7分評估你吞嚥困難的嚴重程度（1=正常吞嚥，4=中度吞嚥問題，7=嚴重吞嚥問題）。',
      scale_min: 1,
      scale_max: 7,
    },
    items: [
      { item_number: 1, subscale: 'physical', text_en: 'I cough when I drink liquids.', text_zh: '我喝液體時會咳嗽。' },
      { item_number: 2, subscale: 'physical', text_en: 'I cough when I eat solid food.', text_zh: '我吃固體食物時會咳嗽。' },
      { item_number: 3, subscale: 'physical', text_en: 'I have to swallow again before food will go down.', text_zh: '我需要再吞一次食物才能嚥下去。' },
      { item_number: 4, subscale: 'physical', text_en: 'Swallowing is difficult for me.', text_zh: '吞嚥對我來說很困難。' },
      { item_number: 5, subscale: 'physical', text_en: 'I drool.', text_zh: '我會流口水。' },
      { item_number: 6, subscale: 'physical', text_en: 'I choke when I take my medication.', text_zh: '我服藥時會嗆到。' },
      { item_number: 7, subscale: 'physical', text_en: 'Food sticks in my throat.', text_zh: '食物會卡在我的喉嚨裡。' },
      { item_number: 8, subscale: 'physical', text_en: 'Food sticks in my mouth.', text_zh: '食物會黏在我的口腔裡。' },
      { item_number: 9, subscale: 'physical', text_en: 'I have difficulty breathing when I eat.', text_zh: '我進食時呼吸困難。' },
      { item_number: 10, subscale: 'functional', text_en: 'I limit my food intake because of my swallowing difficulty.', text_zh: '因為吞嚥困難，我限制了進食量。' },
      { item_number: 11, subscale: 'functional', text_en: 'My swallowing difficulty has caused me to lose weight.', text_zh: '我的吞嚥困難導致我體重減輕。' },
      { item_number: 12, subscale: 'functional', text_en: 'I eat less because of my swallowing difficulty.', text_zh: '因為吞嚥困難，我吃得較少。' },
      { item_number: 13, subscale: 'functional', text_en: 'It takes me longer to eat because of my swallowing difficulty.', text_zh: '因為吞嚥困難，我進食時間變長。' },
      { item_number: 14, subscale: 'functional', text_en: 'I no longer enjoy eating because of my swallowing difficulty.', text_zh: '因為吞嚥困難，我不再享受進食。' },
      { item_number: 15, subscale: 'functional', text_en: 'I am not able to eat certain foods because of my swallowing difficulty.', text_zh: '因為吞嚥困難，我無法進食某些食物。' },
      { item_number: 16, subscale: 'functional', text_en: 'I am not able to eat out at restaurants because of my swallowing difficulty.', text_zh: '因為吞嚥困難，我無法外出到餐廳用餐。' },
      { item_number: 17, subscale: 'functional', text_en: 'I avoid eating with other people because of my swallowing difficulty.', text_zh: '因為吞嚥困難，我避免與他人一起用餐。' },
      { item_number: 18, subscale: 'functional', text_en: 'I have difficulty cooking because of my swallowing difficulty.', text_zh: '因為吞嚥困難，我煮食有困難。' },
      { item_number: 19, subscale: 'emotional', text_en: 'I am embarrassed by my eating habits.', text_zh: '我對自己的進食習慣感到尷尬。' },
      { item_number: 20, subscale: 'emotional', text_en: 'I feel handicapped because of my swallowing difficulty.', text_zh: '因為吞嚥困難，我感到殘障。' },
      { item_number: 21, subscale: 'emotional', text_en: 'I am upset by my swallowing problem.', text_zh: '我的吞嚥問題令我感到沮喪。' },
      { item_number: 22, subscale: 'emotional', text_en: 'I am annoyed when I have to eat.', text_zh: '我在進食時感到煩躁。' },
      { item_number: 23, subscale: 'emotional', text_en: 'My swallowing difficulty depresses me.', text_zh: '我的吞嚥困難令我感到抑鬱。' },
      { item_number: 24, subscale: 'emotional', text_en: 'I worry about getting pneumonia.', text_zh: '我擔心患上肺炎。' },
      { item_number: 25, subscale: 'emotional', text_en: 'I fear that I will choke.', text_zh: '我害怕會嗆到。' },
    ],
  },
  fois: {
    id: 'fois',
    name_en: 'Functional Oral Intake Scale (FOIS)',
    name_zh: '功能性經口進食量表 (FOIS)',
    description_en: 'A 7-point ordinal scale documenting the functional level of oral intake of food and liquid.',
    description_zh: '一個7級量表，記錄食物和液體的功能性經口攝取水平。',
    reference: 'Crary et al. (2005)',
    type: 'clinician_rated',
    scoring_method: 'single_level',
    total_min: 1,
    total_max: 7,
    interpretation_en: 'Levels 1-3 indicate tube dependence. Levels 4-7 indicate total oral intake with varying degrees of restriction.',
    interpretation_zh: '第1-3級表示依賴管飼。第4-7級表示完全經口進食，但限制程度不同。',
    fois_items: [
      { level: 1, category_en: 'TUBE DEPENDENT', category_zh: '依賴管飼', text_en: 'No oral intake.', text_zh: '完全沒有經口攝取。' },
      { level: 2, category_en: 'TUBE DEPENDENT', category_zh: '依賴管飼', text_en: 'Tube dependent with minimal/inconsistent oral intake.', text_zh: '依賴管飼，經口攝取極少/不穩定。' },
      { level: 3, category_en: 'TUBE DEPENDENT', category_zh: '依賴管飼', text_en: 'Tube supplements with consistent oral intake.', text_zh: '管飼補充，持續有經口攝取。' },
      { level: 4, category_en: 'TOTAL ORAL INTAKE', category_zh: '完全經口進食', text_en: 'Total oral intake of a single consistency.', text_zh: '完全經口進食單一質地食物。' },
      { level: 5, category_en: 'TOTAL ORAL INTAKE', category_zh: '完全經口進食', text_en: 'Total oral intake of multiple consistencies requiring special preparation.', text_zh: '完全經口進食多種質地食物，但需要特別處理。' },
      { level: 6, category_en: 'TOTAL ORAL INTAKE', category_zh: '完全經口進食', text_en: 'Total oral intake with no special preparation, but must avoid specific foods or liquid items.', text_zh: '完全經口進食，不需特別處理，但必須避免特定食物或液體。' },
      { level: 7, category_en: 'TOTAL ORAL INTAKE', category_zh: '完全經口進食', text_en: 'Total oral intake with no restrictions.', text_zh: '完全經口進食，沒有任何限制。' },
    ],
  },
  msus: {
    id: 'msus',
    name_en: 'Modified System Usability Scale (MSUS)',
    name_zh: '改良版系統可用性量表 (MSUS)',
    description_en: 'An adapted version of the SUS modified for evaluating clinical therapy apps.',
    description_zh: '改良版的系統可用性量表，經修改用於評估臨床治療應用程式。',
    reference: 'Brooke (1996)',
    type: 'patient_self_report',
    scoring_method: 'sus_formula',
    scale_min: 1,
    scale_max: 5,
    scale_labels: {
      '1': { en: 'Strongly Disagree', zh: '非常不同意' },
      '2': { en: 'Disagree', zh: '不同意' },
      '3': { en: 'Neutral', zh: '中立' },
      '4': { en: 'Agree', zh: '同意' },
      '5': { en: 'Strongly Agree', zh: '非常同意' },
    },
    total_min: 0,
    total_max: 100,
    interpretation_en: 'Score 0-64: Not acceptable. Score 65-84: Acceptable. Score 85-100: Excellent.',
    interpretation_zh: '0-64分：不可接受。65-84分：可接受。85-100分：優秀。',
    items: [
      { item_number: 1, tone: 'positive', text_en: 'I think that I would like to use this app frequently.', text_zh: '我認為我會經常使用這個應用程式。' },
      { item_number: 2, tone: 'negative', text_en: 'I found the app unnecessarily complex.', text_zh: '我覺得這個應用程式過於複雜。' },
      { item_number: 3, tone: 'positive', text_en: 'I thought the app was easy to use.', text_zh: '我認為這個應用程式容易使用。' },
      { item_number: 4, tone: 'negative', text_en: 'I think that I would need the support of a technical person to be able to use this app.', text_zh: '我認為我需要技術人員的支援才能使用這個應用程式。' },
      { item_number: 5, tone: 'positive', text_en: 'I found the various functions in this app were well integrated.', text_zh: '我認為這個應用程式的各項功能整合得很好。' },
      { item_number: 6, tone: 'negative', text_en: 'I thought there was too much inconsistency in this app.', text_zh: '我認為這個應用程式有太多不一致的地方。' },
      { item_number: 7, tone: 'positive', text_en: 'I would imagine that most people would learn to use this app very quickly.', text_zh: '我認為大部分人都能很快學會使用這個應用程式。' },
      { item_number: 8, tone: 'negative', text_en: 'I found the app very awkward to use.', text_zh: '我覺得使用這個應用程式非常笨拙/不方便。' },
      { item_number: 9, tone: 'positive', text_en: 'I felt very confident using the app.', text_zh: '我使用這個應用程式時感到非常有信心。' },
      { item_number: 10, tone: 'negative', text_en: 'I needed to learn a lot of things before I could get going with this app.', text_zh: '在使用這個應用程式之前，我需要學習很多東西。' },
    ],
  },
  swal_qol: {
    id: 'swal_qol',
    name_en: 'Swallowing Quality of Life Questionnaire (SWAL-QOL)',
    name_zh: '吞嚥生活質素問卷 (SWAL-QOL)',
    description_en: 'A 44-item patient-centered outcomes tool assessing quality-of-life domains related to dysphagia.',
    description_zh: '一份44題以患者為中心的結果評估工具，涵蓋與吞嚥困難相關的生活質素範疇。',
    reference: 'McHorney et al. (2002)',
    type: 'patient_self_report',
    scoring_method: 'domain_scoring',
    scale_min: 1,
    scale_max: 5,
    total_min: 0,
    total_max: 100,
    interpretation_en: 'Higher scores indicate better swallowing-related quality of life (0=extremely impaired, 100=no impairment).',
    interpretation_zh: '分數越高表示吞嚥相關的生活質素越好（0=極度受損，100=無損害）。',
    domains: [
      {
        domain_id: 'burden', name_en: 'General Burden', name_zh: '一般負擔',
        scale_labels: { '1': { en: 'Strongly agree', zh: '非常同意' }, '2': { en: 'Agree', zh: '同意' }, '3': { en: 'Undecided', zh: '不確定' }, '4': { en: 'Disagree', zh: '不同意' }, '5': { en: 'Strongly disagree', zh: '非常不同意' } },
        items: [
          { item_number: 1, text_en: 'Dealing with my swallowing problem is very difficult.', text_zh: '處理我的吞嚥問題非常困難。' },
          { item_number: 2, text_en: 'My swallowing problem is a major distraction in my life.', text_zh: '我的吞嚥問題嚴重影響了我的生活。' },
        ],
      },
      {
        domain_id: 'eating_desire', name_en: 'Eating Desire', name_zh: '進食意慾',
        scale_labels: { '1': { en: 'Strongly agree', zh: '非常同意' }, '2': { en: 'Agree', zh: '同意' }, '3': { en: 'Undecided', zh: '不確定' }, '4': { en: 'Disagree', zh: '不同意' }, '5': { en: 'Strongly disagree', zh: '非常不同意' } },
        items: [
          { item_number: 3, text_en: 'I do not know when I am going to be hungry anymore.', text_zh: '我不再知道自己何時會感到飢餓。' },
          { item_number: 4, text_en: 'It is difficult to find foods that I both like and can eat.', text_zh: '很難找到我既喜歡又能吃的食物。' },
          { item_number: 5, text_en: 'It takes me longer to eat than other people.', text_zh: '我進食的時間比別人長。' },
        ],
      },
      {
        domain_id: 'eating_duration', name_en: 'Eating Duration', name_zh: '進食時間',
        scale_labels: { '1': { en: 'Strongly agree', zh: '非常同意' }, '2': { en: 'Agree', zh: '同意' }, '3': { en: 'Undecided', zh: '不確定' }, '4': { en: 'Disagree', zh: '不同意' }, '5': { en: 'Strongly disagree', zh: '非常不同意' } },
        items: [
          { item_number: 6, text_en: 'It takes me much longer to eat a meal than it used to.', text_zh: '我吃一頓飯的時間比以前長得多。' },
          { item_number: 7, text_en: 'I take much longer to eat a meal because of my swallowing problem.', text_zh: '因為吞嚥問題，我進食一頓飯需要更長時間。' },
        ],
      },
      {
        domain_id: 'symptom_frequency', name_en: 'Symptom Frequency', name_zh: '症狀頻率',
        scale_labels: { '1': { en: 'Almost always', zh: '幾乎總是' }, '2': { en: 'Often', zh: '經常' }, '3': { en: 'Sometimes', zh: '有時' }, '4': { en: 'Hardly ever', zh: '很少' }, '5': { en: 'Never', zh: '從不' } },
        items: [
          { item_number: 8, text_en: 'I cough.', text_zh: '我會咳嗽。' },
          { item_number: 9, text_en: 'I choke when I eat food.', text_zh: '我進食時會嗆到。' },
          { item_number: 10, text_en: 'I choke when I drink liquids.', text_zh: '我喝液體時會嗆到。' },
          { item_number: 11, text_en: 'I have thick saliva or phlegm.', text_zh: '我有濃稠的唾液或痰。' },
          { item_number: 12, text_en: 'I gag.', text_zh: '我有作嘔反應。' },
          { item_number: 13, text_en: 'I drool.', text_zh: '我會流口水。' },
          { item_number: 14, text_en: 'I have problems chewing.', text_zh: '我咀嚼有困難。' },
          { item_number: 15, text_en: 'I have excess saliva or phlegm.', text_zh: '我有過多的唾液或痰。' },
          { item_number: 16, text_en: 'I have to clear my throat.', text_zh: '我需要清喉嚨。' },
          { item_number: 17, text_en: 'Food sticks in my throat.', text_zh: '食物會卡在喉嚨裡。' },
          { item_number: 18, text_en: 'Food sticks in my mouth.', text_zh: '食物會黏在口腔裡。' },
          { item_number: 19, text_en: 'Food or liquid dribbles out of my mouth.', text_zh: '食物或液體從我的口中漏出。' },
          { item_number: 20, text_en: 'Food or liquid comes out my nose.', text_zh: '食物或液體從我的鼻子出來。' },
          { item_number: 21, text_en: 'I cough food or liquid out of my mouth when it gets stuck.', text_zh: '食物卡住時我會咳出口中的食物或液體。' },
        ],
      },
      {
        domain_id: 'food_selection', name_en: 'Food Selection', name_zh: '食物選擇',
        scale_labels: { '1': { en: 'Strongly agree', zh: '非常同意' }, '2': { en: 'Agree', zh: '同意' }, '3': { en: 'Undecided', zh: '不確定' }, '4': { en: 'Disagree', zh: '不同意' }, '5': { en: 'Strongly disagree', zh: '非常不同意' } },
        items: [
          { item_number: 22, text_en: 'Figuring out what I can and cannot eat is a problem for me.', text_zh: '判斷我能吃和不能吃的食物對我來說是個問題。' },
          { item_number: 23, text_en: 'It is hard to find foods that I can eat.', text_zh: '很難找到我能吃的食物。' },
        ],
      },
      {
        domain_id: 'communication', name_en: 'Communication', name_zh: '溝通',
        scale_labels: { '1': { en: 'Strongly agree', zh: '非常同意' }, '2': { en: 'Agree', zh: '同意' }, '3': { en: 'Undecided', zh: '不確定' }, '4': { en: 'Disagree', zh: '不同意' }, '5': { en: 'Strongly disagree', zh: '非常不同意' } },
        items: [
          { item_number: 24, text_en: 'People have a hard time understanding me.', text_zh: '別人很難聽懂我說話。' },
          { item_number: 25, text_en: 'It has been difficult for me to speak clearly.', text_zh: '我說話不清楚。' },
        ],
      },
      {
        domain_id: 'fear', name_en: 'Fear of Eating', name_zh: '進食恐懼',
        scale_labels: { '1': { en: 'Strongly agree', zh: '非常同意' }, '2': { en: 'Agree', zh: '同意' }, '3': { en: 'Undecided', zh: '不確定' }, '4': { en: 'Disagree', zh: '不同意' }, '5': { en: 'Strongly disagree', zh: '非常不同意' } },
        items: [
          { item_number: 26, text_en: 'I am afraid of choking.', text_zh: '我害怕噎到。' },
          { item_number: 27, text_en: 'I worry about getting pneumonia.', text_zh: '我擔心患上肺炎。' },
          { item_number: 28, text_en: 'I am afraid of eating because I might choke.', text_zh: '我因為怕嗆到而害怕進食。' },
          { item_number: 29, text_en: 'I never know when I am going to choke.', text_zh: '我不知道什麼時候會嗆到。' },
        ],
      },
      {
        domain_id: 'mental_health', name_en: 'Mental Health', name_zh: '心理健康',
        scale_labels: { '1': { en: 'Strongly agree', zh: '非常同意' }, '2': { en: 'Agree', zh: '同意' }, '3': { en: 'Undecided', zh: '不確定' }, '4': { en: 'Disagree', zh: '不同意' }, '5': { en: 'Strongly disagree', zh: '非常不同意' } },
        items: [
          { item_number: 30, text_en: 'My swallowing problem depresses me.', text_zh: '我的吞嚥問題令我感到抑鬱。' },
          { item_number: 31, text_en: 'My swallowing problem frustrates me.', text_zh: '我的吞嚥問題令我感到沮喪。' },
          { item_number: 32, text_en: 'I am bothered by my swallowing problem.', text_zh: '我的吞嚥問題困擾着我。' },
          { item_number: 33, text_en: 'I get impatient dealing with my swallowing problem.', text_zh: '處理吞嚥問題令我不耐煩。' },
          { item_number: 34, text_en: 'My swallowing problem makes me unhappy.', text_zh: '我的吞嚥問題令我不開心。' },
        ],
      },
      {
        domain_id: 'social', name_en: 'Social Functioning', name_zh: '社交功能',
        scale_labels: { '1': { en: 'Strongly agree', zh: '非常同意' }, '2': { en: 'Agree', zh: '同意' }, '3': { en: 'Undecided', zh: '不確定' }, '4': { en: 'Disagree', zh: '不同意' }, '5': { en: 'Strongly disagree', zh: '非常不同意' } },
        items: [
          { item_number: 35, text_en: 'I do not go out to eat because of my swallowing problem.', text_zh: '因為吞嚥問題，我不外出進食。' },
          { item_number: 36, text_en: 'My swallowing problem makes it hard to have a social life.', text_zh: '我的吞嚥問題令社交生活變得困難。' },
          { item_number: 37, text_en: 'My usual work or leisure activities have changed because of my swallowing problem.', text_zh: '因為吞嚥問題，我的工作或休閒活動發生了變化。' },
          { item_number: 38, text_en: 'Social gatherings are not enjoyable because of my swallowing problem.', text_zh: '因為吞嚥問題，社交聚會變得不愉快。' },
          { item_number: 39, text_en: 'My role with family and friends has changed because of my swallowing problem.', text_zh: '因為吞嚥問題，我在家庭和朋友中的角色發生了變化。' },
        ],
      },
      {
        domain_id: 'fatigue', name_en: 'Fatigue', name_zh: '疲勞',
        scale_labels: { '1': { en: 'Strongly agree', zh: '非常同意' }, '2': { en: 'Agree', zh: '同意' }, '3': { en: 'Undecided', zh: '不確定' }, '4': { en: 'Disagree', zh: '不同意' }, '5': { en: 'Strongly disagree', zh: '非常不同意' } },
        items: [
          { item_number: 40, text_en: 'I feel weak.', text_zh: '我感到虛弱。' },
          { item_number: 41, text_en: 'I feel tired.', text_zh: '我感到疲倦。' },
          { item_number: 42, text_en: 'I feel exhausted.', text_zh: '我感到精疲力竭。' },
        ],
      },
      {
        domain_id: 'sleep', name_en: 'Sleep', name_zh: '睡眠',
        scale_labels: { '1': { en: 'Strongly agree', zh: '非常同意' }, '2': { en: 'Agree', zh: '同意' }, '3': { en: 'Undecided', zh: '不確定' }, '4': { en: 'Disagree', zh: '不同意' }, '5': { en: 'Strongly disagree', zh: '非常不同意' } },
        items: [
          { item_number: 43, text_en: 'I have difficulty falling asleep.', text_zh: '我入睡困難。' },
          { item_number: 44, text_en: 'I have trouble staying asleep.', text_zh: '我難以維持睡眠。' },
        ],
      },
    ],
  },
  swal_care: {
    id: 'swal_care',
    name_en: 'SWAL-CARE (Quality of Care & Patient Satisfaction)',
    name_zh: 'SWAL-CARE（照護質素及患者滿意度）',
    description_en: 'A 15-item tool assessing quality of care and patient satisfaction for people with dysphagia.',
    description_zh: '一份15題的工具，評估吞嚥困難患者的照護質素和滿意度。',
    reference: 'McHorney et al. (2002)',
    type: 'patient_self_report',
    scoring_method: 'domain_scoring',
    scale_min: 1,
    scale_max: 5,
    total_min: 0,
    total_max: 100,
    interpretation_en: 'Higher scores indicate better perceived quality of care and satisfaction.',
    interpretation_zh: '分數越高表示患者感受到的照護質素和滿意度越好。',
    domains: [
      {
        domain_id: 'clinical_advice', name_en: 'Clinical Advice and Information', name_zh: '臨床建議和資訊',
        scale_labels: { '1': { en: 'Poor', zh: '差' }, '2': { en: 'Fair', zh: '尚可' }, '3': { en: 'Good', zh: '好' }, '4': { en: 'Very good', zh: '很好' }, '5': { en: 'Excellent', zh: '非常好' } },
        items: [
          { item_number: 1, text_en: 'How good was the information given to you about your swallowing problem?', text_zh: '提供給你的吞嚥問題資訊有多好？' },
          { item_number: 2, text_en: 'How good was the information given to you about the treatment of your swallowing problem?', text_zh: '提供給你的吞嚥問題治療資訊有多好？' },
          { item_number: 3, text_en: 'How good was the information given to you about foods that are safe to eat?', text_zh: '提供給你的安全食物資訊有多好？' },
          { item_number: 4, text_en: 'How good was the information given to you about how to manage your swallowing problem?', text_zh: '提供給你的吞嚥問題管理資訊有多好？' },
          { item_number: 5, text_en: 'How good was the information given to you about liquids that are safe to drink?', text_zh: '提供給你的安全液體飲用資訊有多好？' },
          { item_number: 6, text_en: 'How good was the information given to you about what caused your swallowing problem?', text_zh: '提供給你的吞嚥問題成因資訊有多好？' },
          { item_number: 7, text_en: 'How good was the information given to you about how to cope with your swallowing problem?', text_zh: '提供給你的應對吞嚥問題資訊有多好？' },
          { item_number: 8, text_en: 'Were you told about any exercises to help your swallowing?', text_zh: '是否有人告訴你有幫助吞嚥的運動？' },
          { item_number: 9, text_en: 'Were you told about any devices to help your swallowing?', text_zh: '是否有人告訴你有幫助吞嚥的設備？' },
          { item_number: 10, text_en: 'Were you told about any swallowing tricks or maneuvers?', text_zh: '是否有人告訴你吞嚥技巧或方法？' },
        ],
      },
      {
        domain_id: 'patient_satisfaction', name_en: 'Patient Satisfaction', name_zh: '患者滿意度',
        scale_labels: { '1': { en: 'Strongly agree', zh: '非常同意' }, '2': { en: 'Agree', zh: '同意' }, '3': { en: 'Undecided', zh: '不確定' }, '4': { en: 'Disagree', zh: '不同意' }, '5': { en: 'Strongly disagree', zh: '非常不同意' } },
        items: [
          { item_number: 11, text_en: 'I know whom to call if I have a problem with my swallowing.', text_zh: '如果吞嚥有問題，我知道可以聯絡誰。' },
          { item_number: 12, text_en: 'My needs have been fully addressed.', text_zh: '我的需求已被充分照顧到。' },
          { item_number: 13, text_en: 'I know how to deal with my swallowing problem.', text_zh: '我知道如何處理吞嚥問題。' },
          { item_number: 14, text_en: 'Overall, I am satisfied with the care I have received for my swallowing problem.', text_zh: '總體而言，我對收到的吞嚥問題護理感到滿意。' },
          { item_number: 15, text_en: 'I would recommend this swallowing program to others.', text_zh: '我會向他人推薦這個吞嚥治療計劃。' },
        ],
      },
    ],
  },
  fda_2: {
    id: 'fda_2',
    name_en: 'Frenchay Dysarthria Assessment - 2nd Ed. (FDA-2)',
    name_zh: 'Frenchay構音障礙評估 - 第二版 (FDA-2)',
    description_en: 'A clinician-administered rating scale assessing speech function across 8 sections with 28 items.',
    description_zh: '一個由臨床人員施測的評估量表，評估與語音功能相關的8個部分共28個項目的表現。',
    reference: 'Enderby & Palmer (2008)',
    type: 'clinician_rated',
    scoring_method: 'fda2_rating',
    interpretation_en: 'Results show strengths and weaknesses across speech subsystems.',
    interpretation_zh: '結果顯示言語各子系統的優勢和弱點。',
    fda2_scale: {
      a: { en: 'Normal (no abnormality)', zh: '正常（無異常）' },
      b: { en: 'Mild (mild abnormality)', zh: '輕度（輕微異常）' },
      c: { en: 'Moderate (moderate abnormality)', zh: '中度（中度異常）' },
      d: { en: 'Severe (severe abnormality)', zh: '嚴重（嚴重異常）' },
      e: { en: 'Profound (no function/unable to assess)', zh: '極嚴重（無功能/無法評估）' },
    },
    fda2_sections: [
      { section_number: 1, name_en: 'Reflexes', name_zh: '反射', items: [{ item_id: '1a', text_en: 'Cough', text_zh: '咳嗽反射' }, { item_id: '1b', text_en: 'Swallow', text_zh: '吞嚥反射' }, { item_id: '1c', text_en: 'Dribble/Drool', text_zh: '流口水' }] },
      { section_number: 2, name_en: 'Respiration', name_zh: '呼吸', items: [{ item_id: '2a', text_en: 'At rest', text_zh: '靜態' }, { item_id: '2b', text_en: 'In speech', text_zh: '說話時' }] },
      { section_number: 3, name_en: 'Lips', name_zh: '嘴唇', items: [{ item_id: '3a', text_en: 'At rest', text_zh: '靜態' }, { item_id: '3b', text_en: 'Spread', text_zh: '展開' }, { item_id: '3c', text_en: 'Seal', text_zh: '閉合' }, { item_id: '3d', text_en: 'Alternate', text_zh: '交替動作' }, { item_id: '3e', text_en: 'In speech', text_zh: '說話時' }] },
      { section_number: 4, name_en: 'Palate', name_zh: '顎', items: [{ item_id: '4a', text_en: 'Fluids', text_zh: '液體' }, { item_id: '4b', text_en: 'Maintenance', text_zh: '維持' }, { item_id: '4c', text_en: 'In speech', text_zh: '說話時' }] },
      { section_number: 5, name_en: 'Laryngeal', name_zh: '喉部', items: [{ item_id: '5a', text_en: 'Time', text_zh: '持續時間' }, { item_id: '5b', text_en: 'Pitch', text_zh: '音調' }, { item_id: '5c', text_en: 'Volume', text_zh: '音量' }, { item_id: '5d', text_en: 'In speech', text_zh: '說話時' }] },
      { section_number: 6, name_en: 'Tongue', name_zh: '舌頭', items: [{ item_id: '6a', text_en: 'At rest', text_zh: '靜態' }, { item_id: '6b', text_en: 'Protrusion', text_zh: '伸出' }, { item_id: '6c', text_en: 'Elevation', text_zh: '上抬' }, { item_id: '6d', text_en: 'Lateral', text_zh: '側向動作' }, { item_id: '6e', text_en: 'Alternate', text_zh: '交替動作' }, { item_id: '6f', text_en: 'In speech', text_zh: '說話時' }] },
      { section_number: 7, name_en: 'Intelligibility', name_zh: '言語清晰度', items: [{ item_id: '7a', text_en: 'Words', text_zh: '字詞' }, { item_id: '7b', text_en: 'Sentences', text_zh: '句子' }, { item_id: '7c', text_en: 'Conversation', text_zh: '對話' }] },
      { section_number: 8, name_en: 'Influencing Factors', name_zh: '影響因素', items: [{ item_id: '8a', text_en: 'Hearing', text_zh: '聽力' }, { item_id: '8b', text_en: 'Sight', text_zh: '視力' }, { item_id: '8c', text_en: 'Teeth', text_zh: '牙齒' }, { item_id: '8d', text_en: 'Language', text_zh: '語言能力' }, { item_id: '8e', text_en: 'Mood', text_zh: '情緒' }, { item_id: '8f', text_en: 'Posture', text_zh: '姿勢' }, { item_id: '8g', text_en: 'Rate (words per minute)', text_zh: '語速（每分鐘字數）' }, { item_id: '8h', text_en: 'Sensation', text_zh: '感覺' }] },
    ],
  },
  coast: {
    id: 'coast',
    name_en: 'Communication Outcomes After Stroke (COAST)',
    name_zh: '中風後溝通成效量表 (COAST)',
    description_en: 'A 20-item patient-centered measure of self-perceived communication effectiveness.',
    description_zh: '一份20題以患者為中心的量表，評估自我感知的溝通有效性。',
    reference: 'Long et al. (2008)',
    type: 'patient_self_report',
    scoring_method: 'coast_scoring',
    scale_min: 0,
    scale_max: 4,
    total_min: 0,
    total_max: 80,
    interpretation_en: 'Higher scores indicate better self-perceived communication effectiveness.',
    interpretation_zh: '分數越高表示自我感知的溝通有效性越好。',
    subscales: {
      communication_effectiveness: { items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], max: 48 },
      change_perception: { items: [13, 14, 15], max: 12 },
      quality_of_life: { items: [16, 17, 18, 19, 20], max: 20 },
    },
    domains: [
      {
        domain_id: 'expressive_communication', name_en: 'Expressive Communication', name_zh: '表達性溝通',
        items: [
          { item_number: 1, text_en: 'In the past week or so how well could you show that you mean YES or NO?', text_zh: '在過去一周左右，你能多好地表達「是」或「否」？', scale_labels: { '0': { en: "Couldn't do it at all", zh: '完全做不到' }, '1': { en: 'With a lot of difficulty', zh: '非常困難' }, '2': { en: 'With some difficulty', zh: '有些困難' }, '3': { en: 'Quite well', zh: '相當好' }, '4': { en: 'Very well', zh: '非常好' } } },
          { item_number: 2, text_en: 'Nowadays, how well can you use other ways to help you communicate?', text_zh: '現在，你能多好地使用其他方式幫助你溝通？', scale_labels: { '0': { en: "Can't do it at all", zh: '完全做不到' }, '1': { en: 'With a lot of difficulty', zh: '非常困難' }, '2': { en: 'With some difficulty', zh: '有些困難' }, '3': { en: 'Quite well', zh: '相當好' }, '4': { en: 'Very well', zh: '非常好' } } },
          { item_number: 6, text_en: 'Nowadays, how easily can you make yourself understood in longer sentences?', text_zh: '現在，你能多容易地用較長的句子讓別人理解你？', scale_labels: { '0': { en: "Can't do it at all", zh: '完全做不到' }, '1': { en: 'With a lot of difficulty', zh: '非常困難' }, '2': { en: 'With some difficulty', zh: '有些困難' }, '3': { en: 'Quite well', zh: '相當好' }, '4': { en: 'Very well', zh: '非常好' } } },
        ],
      },
      {
        domain_id: 'interactive_communication', name_en: 'Interactive Communication', name_zh: '互動性溝通',
        items: [
          { item_number: 3, text_en: 'In the past week or so how well could you have a chat with someone you know well?', text_zh: '在過去一周左右，你能多好地與熟人聊天？', scale_labels: { '0': { en: "Couldn't do it at all", zh: '完全做不到' }, '1': { en: 'With a lot of difficulty', zh: '非常困難' }, '2': { en: 'With some difficulty', zh: '有些困難' }, '3': { en: 'Quite well', zh: '相當好' }, '4': { en: 'Very well', zh: '非常好' } } },
          { item_number: 4, text_en: 'In the past week or so how well could you have a short conversation with an unfamiliar person?', text_zh: '在過去一周左右，你能多好地與陌生人進行簡短對話？', scale_labels: { '0': { en: "Couldn't do it at all", zh: '完全做不到' }, '1': { en: 'With a lot of difficulty', zh: '非常困難' }, '2': { en: 'With some difficulty', zh: '有些困難' }, '3': { en: 'Quite well', zh: '相當好' }, '4': { en: 'Very well', zh: '非常好' } } },
          { item_number: 5, text_en: 'In the past week or so how well could you join in a conversation with a group of people?', text_zh: '在過去一周左右，你能多好地加入一群人的對話？', scale_labels: { '0': { en: "Couldn't do it at all", zh: '完全做不到' }, '1': { en: 'With a lot of difficulty', zh: '非常困難' }, '2': { en: 'With some difficulty', zh: '有些困難' }, '3': { en: 'Quite well', zh: '相當好' }, '4': { en: 'Very well', zh: '非常好' } } },
          { item_number: 8, text_en: 'Nowadays, how well can you show that you don\'t understand?', text_zh: '現在，你能多好地表示你不理解？', scale_labels: { '0': { en: "Can't do it at all", zh: '完全做不到' }, '1': { en: 'With a lot of difficulty', zh: '非常困難' }, '2': { en: 'With some difficulty', zh: '有些困難' }, '3': { en: 'Quite well', zh: '相當好' }, '4': { en: 'Very well', zh: '非常好' } } },
        ],
      },
      {
        domain_id: 'receptive_communication', name_en: 'Receptive Communication', name_zh: '接收性溝通',
        items: [
          { item_number: 7, text_en: 'In the past week or so how well could you understand simple spoken information?', text_zh: '在過去一周左右，你能多好地理解簡單的口頭信息？', scale_labels: { '0': { en: "Couldn't do it at all", zh: '完全做不到' }, '1': { en: 'With a lot of difficulty', zh: '非常困難' }, '2': { en: 'With some difficulty', zh: '有些困難' }, '3': { en: 'Quite well', zh: '相當好' }, '4': { en: 'Very well', zh: '非常好' } } },
          { item_number: 9, text_en: 'In the past week or so how well could you follow a change of subject in conversation?', text_zh: '在過去一周左右，你能多好地跟上對話中話題的轉換？', scale_labels: { '0': { en: "Couldn't do it at all", zh: '完全做不到' }, '1': { en: 'With a lot of difficulty', zh: '非常困難' }, '2': { en: 'With some difficulty', zh: '有些困難' }, '3': { en: 'Quite well', zh: '相當好' }, '4': { en: 'Very well', zh: '非常好' } } },
          { item_number: 10, text_en: 'In the past week or so how well could you read?', text_zh: '在過去一周左右，你能多好地閱讀？', scale_labels: { '0': { en: "Couldn't do it at all", zh: '完全做不到' }, '1': { en: 'With a lot of difficulty', zh: '非常困難' }, '2': { en: 'With some difficulty', zh: '有些困難' }, '3': { en: 'Quite well', zh: '相當好' }, '4': { en: 'As well as before my stroke', zh: '和中風前一樣好' } } },
          { item_number: 11, text_en: 'In the past week or so how well could you write?', text_zh: '在過去一周左右，你能多好地書寫？', scale_labels: { '0': { en: "Couldn't do it at all", zh: '完全做不到' }, '1': { en: 'With a lot of difficulty', zh: '非常困難' }, '2': { en: 'With some difficulty', zh: '有些困難' }, '3': { en: 'Quite well', zh: '相當好' }, '4': { en: 'As well as before my stroke', zh: '和中風前一樣好' } } },
          { item_number: 12, text_en: 'Nowadays, how well can you deal with money?', text_zh: '現在，你能多好地處理金錢事務？', scale_labels: { '0': { en: "Can't do it at all", zh: '完全做不到' }, '1': { en: 'With a lot of difficulty', zh: '非常困難' }, '2': { en: 'With some difficulty', zh: '有些困難' }, '3': { en: 'Quite well', zh: '相當好' }, '4': { en: 'Very well', zh: '非常好' } } },
        ],
      },
      {
        domain_id: 'change_and_perception', name_en: 'Change & Self-Perception', name_zh: '變化與自我認知',
        items: [
          { item_number: 13, text_en: 'How much has your communication changed since just after your stroke?', text_zh: '自中風後，你的溝通能力改變了多少？', scale_labels: { '0': { en: 'Not changed at all', zh: '完全沒有改變' }, '1': { en: 'A little bit better', zh: '好了一點點' }, '2': { en: 'Quite a bit better', zh: '好了不少' }, '3': { en: 'A lot better', zh: '好了很多' }, '4': { en: 'Completely better', zh: '完全恢復' } } },
          { item_number: 14, text_en: 'What do you think about your communication now?', text_zh: '你覺得你現在的溝通能力如何？', scale_labels: { '0': { en: 'The worst possible', zh: '最差' }, '1': { en: 'Quite poor', zh: '相當差' }, '2': { en: 'Fair', zh: '一般' }, '3': { en: 'Quite good', zh: '相當好' }, '4': { en: 'As good as before my stroke', zh: '和中風前一樣好' } } },
          { item_number: 15, text_en: 'How often does confidence about communicating affect what you do?', text_zh: '溝通信心多常影響你做的事？', scale_labels: { '0': { en: 'All the time', zh: '總是' }, '1': { en: 'Very often', zh: '經常' }, '2': { en: 'Sometimes', zh: '有時' }, '3': { en: 'Hardly ever', zh: '很少' }, '4': { en: 'Never', zh: '從不' } } },
        ],
      },
      {
        domain_id: 'quality_of_life', name_en: 'Quality of Life Impact', name_zh: '生活質素影響',
        items: [
          { item_number: 16, text_en: 'Nowadays, what effect do your speech or language problems have on your family life?', text_zh: '現在，你的言語或語言問題對你的家庭生活有什麼影響？', scale_labels: { '0': { en: 'The worst possible', zh: '最差' }, '1': { en: 'Quite poor', zh: '相當差' }, '2': { en: 'Fair', zh: '一般' }, '3': { en: 'Quite good', zh: '相當好' }, '4': { en: "It's at least as good as before my stroke", zh: '至少和中風前一樣好' } } },
          { item_number: 17, text_en: 'Nowadays, what effect do your speech and language problems have on your social life?', text_zh: '現在，你的言語和語言問題對你的社交生活有什麼影響？', scale_labels: { '0': { en: 'The worst possible', zh: '最差' }, '1': { en: 'Quite poor', zh: '相當差' }, '2': { en: 'Fair', zh: '一般' }, '3': { en: 'Quite good', zh: '相當好' }, '4': { en: "It's at least as good as before my stroke", zh: '至少和中風前一樣好' } } },
          { item_number: 18, text_en: 'Nowadays, what effect do your speech and language problems have on your interests or hobbies?', text_zh: '現在，你的言語和語言問題對你的興趣或愛好有什麼影響？', scale_labels: { '0': { en: 'The worst possible', zh: '最差' }, '1': { en: 'Quite poor', zh: '相當差' }, '2': { en: 'Fair', zh: '一般' }, '3': { en: 'Quite good', zh: '相當好' }, '4': { en: "It's at least as good as before my stroke", zh: '至少和中風前一樣好' } } },
          { item_number: 19, text_en: 'How often do difficulties communicating make you worried or unhappy?', text_zh: '溝通困難多常讓你感到擔心或不開心？', scale_labels: { '0': { en: 'All the time', zh: '總是' }, '1': { en: 'Very often', zh: '經常' }, '2': { en: 'Sometimes', zh: '有時' }, '3': { en: 'Hardly ever', zh: '很少' }, '4': { en: 'Never', zh: '從不' } } },
          { item_number: 20, text_en: 'How do you rate your overall quality of life?', text_zh: '你如何評價你的整體生活質素？', scale_labels: { '0': { en: 'The worst possible', zh: '最差' }, '1': { en: 'Quite poor', zh: '相當差' }, '2': { en: 'Fair', zh: '一般' }, '3': { en: 'Quite good', zh: '相當好' }, '4': { en: "It's at least as good as before my stroke", zh: '至少和中風前一樣好' } } },
        ],
      },
    ],
  },
  d_toms: {
    id: 'd_toms',
    name_en: 'Therapy Outcome Measures for Dysarthria (D-TOMs)',
    name_zh: '構音障礙治療成效量表 (D-TOMs)',
    description_en: 'A clinician-rated outcome measure based on the ICF framework, rating patients on 4 dimensions.',
    description_zh: '一個基於ICF框架的臨床評估工具，在4個維度上使用11點量表對患者進行評分。',
    reference: 'Enderby & John (2015)',
    type: 'clinician_rated',
    scoring_method: 'dtoms_rating',
    interpretation_en: '0 = most severe. 5 = normal. Half-points provide additional sensitivity.',
    interpretation_zh: '0=最嚴重。5=正常。半分提供額外的敏感度。',
    dtoms_dimensions: [
      {
        dimension_id: 'impairment', name_en: 'Impairment', name_zh: '損傷',
        description_en: 'Rates the severity of the speech impairment itself.', description_zh: '評估言語損傷本身的嚴重程度。',
        levels: [
          { score: 0, label_en: 'Most severe impairment. No speech output or profoundly unintelligible.', label_zh: '最嚴重損傷。無言語輸出或極度不清晰。' },
          { score: 1, label_en: 'Severe impairment. Attempts at speech are largely unintelligible.', label_zh: '嚴重損傷。嘗試說話但大部分不清晰。' },
          { score: 2, label_en: 'Severe/moderate impairment. Speech significantly impaired but some words intelligible.', label_zh: '嚴重至中度損傷。言語明顯受損，但部分字詞可以理解。' },
          { score: 3, label_en: 'Moderate impairment. Speech impaired but mostly intelligible to familiar listeners.', label_zh: '中度損傷。言語受損，但熟悉的聽者大致能理解。' },
          { score: 4, label_en: 'Mild impairment. Speech slightly impaired but intelligible to most listeners.', label_zh: '輕度損傷。言語輕微受損，但大部分聽者能理解。' },
          { score: 5, label_en: 'Normal. No impairment in speech.', label_zh: '正常。言語無損傷。' },
        ],
      },
      {
        dimension_id: 'activity', name_en: 'Activity / Communication', name_zh: '活動/溝通',
        description_en: "Rates the person's ability to communicate needs and engage in conversation.", description_zh: '評估患者表達需求和參與對話交流的能力。',
        levels: [
          { score: 0, label_en: 'Unable to communicate in any way.', label_zh: '完全無法以任何方式溝通。' },
          { score: 1, label_en: 'Can signal basic needs only with familiar partners.', label_zh: '只能在熟悉的溝通夥伴幫助下表達基本需求。' },
          { score: 2, label_en: 'Can communicate basic needs and some conversation.', label_zh: '可以溝通基本需求及部分對話。' },
          { score: 3, label_en: 'Can hold a limited conversation in familiar contexts.', label_zh: '在熟悉的情境中可以進行有限的對話。' },
          { score: 4, label_en: 'Can communicate effectively in most situations with occasional difficulty.', label_zh: '在大部分情境中能有效溝通，偶有困難。' },
          { score: 5, label_en: 'Normal communication ability.', label_zh: '正常溝通能力。' },
        ],
      },
      {
        dimension_id: 'participation', name_en: 'Participation', name_zh: '參與',
        description_en: 'Rates the extent of participation in social, vocational, and recreational activities.', description_zh: '評估患者參與社交、職業和休閒活動的程度。',
        levels: [
          { score: 0, label_en: 'No social, vocational, or recreational participation.', label_zh: '沒有社交、職業或休閒參與。' },
          { score: 1, label_en: 'Minimal participation limited to close family or carers.', label_zh: '極少參與，僅限於親密家人或照顧者。' },
          { score: 2, label_en: 'Some participation but significantly restricted.', label_zh: '有一些參與，但明顯受限。' },
          { score: 3, label_en: 'Participation in familiar activities but avoids unfamiliar situations.', label_zh: '參與熟悉的活動，但避免不熟悉的情境。' },
          { score: 4, label_en: 'Participates in most activities with some restriction.', label_zh: '參與大部分活動，有些限制。' },
          { score: 5, label_en: 'Full participation as before.', label_zh: '完全參與，如同以前。' },
        ],
      },
      {
        dimension_id: 'wellbeing', name_en: 'Well-being / Distress', name_zh: '身心健康/困擾',
        description_en: "Rates the person's emotional well-being in relation to the speech difficulty.", description_zh: '評估患者因言語困難而產生的情緒健康狀況。',
        levels: [
          { score: 0, label_en: 'High and constant distress for patient and/or carer.', label_zh: '患者和/或照顧者持續極度困擾。' },
          { score: 1, label_en: 'Significant and persistent distress.', label_zh: '明顯且持續的困擾。' },
          { score: 2, label_en: 'Moderate distress, some coping strategies.', label_zh: '中度困擾，有一些應對策略。' },
          { score: 3, label_en: 'Mild distress, generally coping.', label_zh: '輕度困擾，大致能應對。' },
          { score: 4, label_en: 'Occasional concern but generally positive.', label_zh: '偶有擔憂，但整體正面。' },
          { score: 5, label_en: 'No distress. Normal well-being.', label_zh: '無困擾。正常身心健康。' },
        ],
      },
    ],
  },
  all_wales_mca: {
    id: 'all_wales_mca',
    name_en: 'All-Wales Mouth Care Assessment',
    name_zh: '全威爾斯口腔護理評估',
    description_en: 'A clinician-administered oral health assessment tool developed by NHS Wales for adult inpatients including ICU patients.',
    description_zh: '由威爾斯國民保健署開發的臨床口腔健康評估工具，適用於成人住院患者（包括深切治療部患者）。',
    reference: 'NHS Wales / Public Health Wales',
    type: 'clinician_rated',
    scoring_method: 'categorical_risk_pathway',
    interpretation_en: 'Each category is scored 1-3. Higher total scores indicate higher risk. Patients with any item scoring 3 should be placed on the High Risk pathway.',
    interpretation_zh: '每個類別評分為1-3。總分越高表示風險越高。任何單項評分為3的患者應被列入高風險路徑。',
    risk_pathways: {
      A: { en: 'Standard Mouth Care - No identified risk factors or oral problems', zh: '標準口腔護理 - 沒有識別到的風險因素或口腔問題' },
      B: { en: 'Medium Risk Mouth Care - Some risk factors or mild oral problems', zh: '中等風險口腔護理 - 識別到一些風險因素或輕微口腔問題' },
      C: { en: 'High Risk Mouth Care - Significant risk factors or oral problems', zh: '高風險口腔護理 - 存在重大風險因素或口腔問題' },
    },
    mca_sections: [
      {
        section_id: 'risk_screening',
        name_en: 'Risk Factor Screening Questions',
        name_zh: '風險因素篩查問題',
        description_en: 'Five key screening questions to identify risk factors for oral health deterioration.',
        description_zh: '五個關鍵篩查問題，以識別口腔健康惡化的風險因素。',
        items: [
          { item_id: 'rs1', text_en: 'Does the patient have their own teeth and/or dentures?', text_zh: '患者是否有自己的牙齒和/或義齒？', response_type: 'yes_no' },
          { item_id: 'rs2', text_en: 'Is the patient nil by mouth (NBM) or on a modified diet?', text_zh: '患者是否禁食（NBM）或進食改良飲食？', response_type: 'yes_no' },
          { item_id: 'rs3', text_en: 'Is the patient on oxygen therapy or receiving mouth-drying medications?', text_zh: '患者是否正在接受氧氣治療或服用導致口乾的藥物？', response_type: 'yes_no' },
          { item_id: 'rs4', text_en: 'Does the patient require assistance with mouth care?', text_zh: '患者是否需要他人協助進行口腔護理？', response_type: 'yes_no' },
          { item_id: 'rs5', text_en: 'Does the patient have any swallowing difficulties (dysphagia)?', text_zh: '患者是否有吞嚥困難？', response_type: 'yes_no' },
        ],
      },
      {
        section_id: 'oral_assessment',
        name_en: 'Oral Cavity Assessment',
        name_zh: '口腔評估',
        description_en: 'Visual inspection of key oral structures. Each category is rated 1-3.',
        description_zh: '對主要口腔結構進行目視檢查。每個類別按1-3分評分。',
        items: [
          { item_id: 'oa1', category_en: 'Lips', category_zh: '嘴唇', scores: { '1': { en: 'Smooth, pink, moist, intact', zh: '光滑、粉紅、濕潤、完整' }, '2': { en: 'Dry, cracked, or slightly swollen', zh: '乾燥、開裂或輕微腫脹' }, '3': { en: 'Ulcerated, bleeding, severely cracked or swollen', zh: '潰瘍、出血、嚴重開裂或腫脹' } } },
          { item_id: 'oa2', category_en: 'Tongue', category_zh: '舌頭', scores: { '1': { en: 'Pink, moist, papillae present', zh: '粉紅、濕潤、有舌乳頭' }, '2': { en: 'Coated, dry, red, or slightly swollen', zh: '有舌苔、乾燥、發紅或輕微腫脹' }, '3': { en: 'Very coated, deeply fissured, ulcerated, or severely swollen', zh: '嚴重舌苔、深裂、潰瘍或嚴重腫脹' } } },
          { item_id: 'oa3', category_en: 'Gums and Oral Mucosa', category_zh: '牙齦和口腔黏膜', scores: { '1': { en: 'Pink, moist, firm, intact', zh: '粉紅、濕潤、堅實、完整' }, '2': { en: 'Red, slightly swollen, dry, or minor coating', zh: '發紅、輕微腫脹、乾燥或少量覆蓋物' }, '3': { en: 'Very red, swollen, ulcerated, bleeding, or white/yellow patches', zh: '非常紅、腫脹、潰瘍、出血或白色/黃色斑塊' } } },
          { item_id: 'oa4', category_en: 'Teeth / Dentures', category_zh: '牙齒/義齒', scores: { '1': { en: 'Clean, no visible plaque or debris', zh: '清潔、無可見菌斑或殘渣' }, '2': { en: 'Some plaque or debris visible', zh: '可見一些菌斑或殘渣' }, '3': { en: 'Heavy plaque, debris, broken or missing teeth', zh: '大量菌斑、殘渣、牙齒破損或缺失' } } },
          { item_id: 'oa5', category_en: 'Saliva', category_zh: '唾液', scores: { '1': { en: 'Watery, normal flow', zh: '水樣、正常流量' }, '2': { en: 'Thick, ropy, or slightly reduced', zh: '黏稠、絲狀或略有減少' }, '3': { en: 'Absent, very thick, or excessive drooling', zh: '缺失、非常黏稠或過度流涎' } } },
          { item_id: 'oa6', category_en: 'Palate (Hard and Soft)', category_zh: '顎（硬顎和軟顎）', scores: { '1': { en: 'Pink, moist, intact', zh: '粉紅、濕潤、完整' }, '2': { en: 'Dry, slightly reddened, or minor coating', zh: '乾燥、輕微發紅或少量覆蓋物' }, '3': { en: 'Ulcerated, bleeding, red, or significant coating/debris', zh: '潰瘍、出血、發紅或大量覆蓋物/殘渣' } } },
          { item_id: 'oa7', category_en: 'Odour', category_zh: '氣味', scores: { '1': { en: 'No unpleasant odour', zh: '無不愉快氣味' }, '2': { en: 'Slightly unpleasant odour', zh: '輕微不愉快氣味' }, '3': { en: 'Strong, foul odour', zh: '強烈惡臭' } } },
        ],
      },
      {
        section_id: 'icu_additional',
        name_en: 'ICU-Specific Additional Items',
        name_zh: '深切治療部額外評估項目',
        description_en: 'Additional items specifically relevant for ICU/intubated patients.',
        description_zh: '專門針對深切治療部/插管患者的額外評估項目。',
        items: [
          { item_id: 'icu1', text_en: 'Is the patient intubated (endotracheal or tracheostomy)?', text_zh: '患者是否已插管（氣管內管或氣管切開）？', response_type: 'yes_no' },
          { item_id: 'icu2', text_en: 'Is there visible secretion pooling in the oral cavity?', text_zh: '口腔中是否可見分泌物積聚？', response_type: 'yes_no' },
          { item_id: 'icu3', text_en: 'Is there evidence of oral trauma from tubes, tapes, or bite blocks?', text_zh: '是否有因管道、膠帶或咬合塊造成的口腔外傷？', response_type: 'yes_no' },
          { item_id: 'icu4', text_en: 'Is oral suctioning required before/during mouth care?', text_zh: '口腔護理前/期間是否需要口腔抽吸？', response_type: 'yes_no' },
          { item_id: 'icu5', text_en: 'Position of endotracheal tube (ETT) secured', text_zh: '氣管內管（ETT）固定位置', response_type: 'text' },
        ],
      },
    ],
  },
  korean_ohat_icu: {
    id: 'korean_ohat_icu',
    name_en: 'Korean Oral Health Assessment Tool for ICU',
    name_zh: '韓國重症患者口腔健康評估工具',
    description_en: 'An oral health assessment tool specifically developed for critically ill patients in ICU settings.',
    description_zh: '一個專門為深切治療部重症患者開發的口腔健康評估工具。',
    reference: 'Kim & Park (2018)',
    type: 'clinician_rated',
    scoring_method: 'ohat_summation',
    total_min: 7,
    total_max: 21,
    interpretation_en: 'Lower total scores indicate better oral health. Scores should be assessed before and after oral nursing care to evaluate effectiveness.',
    interpretation_zh: '總分越低表示口腔健康狀況越好。應在口腔護理前後評估分數，以評價介入措施的效果。',
    ohat_items: [
      { item_number: 1, category_en: 'Lips', category_zh: '嘴唇', category_ko: '입술', scores: { '1': { en: 'Smooth, pink, moist', zh: '光滑、粉紅、濕潤', ko: '매끄럽고, 분홍색, 촉촉함' }, '2': { en: 'Dry, chapped, or red at corners', zh: '乾燥、皸裂或口角發紅', ko: '건조, 갈라짐, 구석이 빨갛게 됨' }, '3': { en: 'Swollen, cracked, bleeding, or ulcerated', zh: '腫脹、開裂、出血或潰瘍', ko: '부어오름, 갈라짐, 출혈 또는 궤양' } } },
      { item_number: 2, category_en: 'Tongue', category_zh: '舌頭', category_ko: '혀', scores: { '1': { en: 'Normal pink, moist, with papillae', zh: '正常粉紅、濕潤、有舌乳頭', ko: '정상 분홍색, 촉촉함, 유두 있음' }, '2': { en: 'Coated or loss of papillae, shiny or dry', zh: '有舌苔或舌乳頭消失、光滑或乾燥', ko: '설태 있음 또는 유두 소실, 매끄러운 외관 또는 건조' }, '3': { en: 'Fissured, blistered, ulcerated, thick coating, or severely swollen', zh: '裂紋、水泡、潰瘍、厚舌苔或嚴重腫脹', ko: '균열, 수포, 궤양, 두꺼운 설태 또는 심한 부종' } } },
      { item_number: 3, category_en: 'Gums and Oral Mucosa', category_zh: '牙齦和口腔黏膜', category_ko: '잇몸과 구강점막', scores: { '1': { en: 'Pink, moist, smooth, no bleeding', zh: '粉紅、濕潤、光滑、無出血', ko: '분홍색, 촉촉함, 매끄러움, 출혈 없음' }, '2': { en: 'Reddened, slightly swollen, or dry', zh: '發紅、輕微腫脹或乾燥', ko: '발적, 약간 부어오름, 또는 건조' }, '3': { en: 'Swollen, bleeding, ulcerated, or white patches', zh: '腫脹、出血、潰瘍或出現白色斑塊', ko: '부어오름, 출혈, 궤양 또는 백색 반점' } } },
      { item_number: 4, category_en: 'Teeth / Dentures', category_zh: '牙齒/義齒', category_ko: '치아/의치', scores: { '1': { en: 'Clean, no debris or plaque visible', zh: '清潔、無可見殘渣或菌斑', ko: '깨끗함, 이물질이나 치태 없음' }, '2': { en: 'Plaque or debris in localized areas', zh: '局部區域有菌斑或殘渣', ko: '국소 부위에 치태 또는 이물질' }, '3': { en: 'Generalized plaque or debris, broken teeth', zh: '全面性菌斑或殘渣、牙齒破損', ko: '전반적 치태 또는 이물질, 파손된 치아' } } },
      { item_number: 5, category_en: 'Saliva', category_zh: '唾液', category_ko: '타액', scores: { '1': { en: 'Moist tissues, watery and free-flowing', zh: '組織濕潤、唾液水樣且流動順暢', ko: '촉촉한 조직, 물같고 자유롭게 흐르는 타액' }, '2': { en: 'Dry or sticky tissues, reduced saliva', zh: '組織乾燥或黏膩、唾液減少', ko: '건조하거나 끈적이는 조직, 타액 감소' }, '3': { en: 'Tissues parched and red, no saliva or thick ropy', zh: '組織乾裂發紅、無唾液或唾液黏稠', ko: '조직이 건조하고 붉음, 타액 없음 또는 점조성 타액' } } },
      { item_number: 6, category_en: 'Oral Cleanliness / Debris', category_zh: '口腔清潔度/殘渣', category_ko: '구강 청결도/이물질', scores: { '1': { en: 'Clean oral cavity, no food particles', zh: '口腔清潔、無食物顆粒', ko: '깨끗한 구강, 음식물 잔여물 없음' }, '2': { en: 'Some food particles or secretions in localized areas', zh: '局部區域有食物顆粒或分泌物', ko: '일부 음식물 잔여물이 국소 부위에 있음' }, '3': { en: 'Copious debris or thick secretions throughout', zh: '口腔中大量殘渣或濃厚分泌物', ko: '구강 전체에 다량의 이물질 또는 두꺼운 분비물' } } },
      { item_number: 7, category_en: 'Odour', category_zh: '氣味', category_ko: '구취', scores: { '1': { en: 'No abnormal odour', zh: '無異常氣味', ko: '비정상적 냄새 없음' }, '2': { en: 'Mildly unpleasant odour', zh: '輕微不愉快氣味', ko: '약간 불쾌한 냄새' }, '3': { en: 'Strong foul odour', zh: '強烈惡臭', ko: '강한 악취' } } },
    ],
  },
  sus: {
    id: 'sus',
    name_en: 'System Usability Scale (SUS)',
    name_zh: '系統可用性量表 (SUS)',
    description_en: 'A 10-item questionnaire measuring perceived usability of a system on a 0-100 scale.',
    description_zh: '一份10題問卷，以0-100分量度系統的可用性。',
    reference: 'Brooke (1996)',
    type: 'patient_self_report',
    scoring_method: 'sus_formula',
    scale_min: 1,
    scale_max: 5,
    scale_labels: {
      '1': { en: 'Strongly Disagree', zh: '非常不同意' },
      '2': { en: 'Disagree', zh: '不同意' },
      '3': { en: 'Neutral', zh: '中立' },
      '4': { en: 'Agree', zh: '同意' },
      '5': { en: 'Strongly Agree', zh: '非常同意' },
    },
    total_min: 0,
    total_max: 100,
    cutoff: 68,
    interpretation_en: 'Score ≥ 68 is above average usability. Score < 68 is below average.',
    interpretation_zh: '得分 ≥ 68 為高於平均可用性。得分 < 68 為低於平均。',
    items: [
      { item_number: 1, tone: 'positive', text_en: 'I think that I would like to use this system frequently.', text_zh: '我認為我會經常使用這個系統。' },
      { item_number: 2, tone: 'negative', text_en: 'I found the system unnecessarily complex.', text_zh: '我覺得這個系統不必要地複雜。' },
      { item_number: 3, tone: 'positive', text_en: 'I thought the system was easy to use.', text_zh: '我認為這個系統容易使用。' },
      { item_number: 4, tone: 'negative', text_en: 'I think that I would need the support of a technical person to be able to use this system.', text_zh: '我認為我需要技術人員的支援才能使用這個系統。' },
      { item_number: 5, tone: 'positive', text_en: 'I found the various functions in this system were well integrated.', text_zh: '我覺得這個系統的各項功能整合得很好。' },
      { item_number: 6, tone: 'negative', text_en: 'I thought there was too much inconsistency in this system.', text_zh: '我認為這個系統有太多不一致的地方。' },
      { item_number: 7, tone: 'positive', text_en: 'I would imagine that most people would learn to use this system very quickly.', text_zh: '我相信大多數人會很快學會使用這個系統。' },
      { item_number: 8, tone: 'negative', text_en: 'I found the system very cumbersome to use.', text_zh: '我覺得使用這個系統非常麻煩。' },
      { item_number: 9, tone: 'positive', text_en: 'I felt very confident using the system.', text_zh: '我對使用這個系統感到非常有信心。' },
      { item_number: 10, tone: 'negative', text_en: 'I needed to learn a lot of things before I could get going with this system.', text_zh: '我需要學習很多東西才能開始使用這個系統。' },
    ],
  },
  beckman_oma: {
    id: 'beckman_oma',
    name_en: 'Beckman Oral Motor Assessment',
    name_zh: 'Beckman口腔動作評估',
    description_en: 'A clinician-administered oral motor evaluation protocol. Assesses response to pressure, range of movement, strength, and control for lips, cheeks, jaw, and tongue. NOTE: Full scoring requires the proprietary manual.',
    description_zh: '臨床口腔動作評估方案。評估嘴唇、面頰、下巴和舌頭的壓力反應、動作範圍、力量和控制。注意：完整評分需參考專有方案手冊。',
    reference: 'Beckman DA (1986, rev. 2019)',
    type: 'clinician_rated',
    scoring_method: 'beckman_recording',
    interpretation_en: 'Each structure is assessed across multiple dimensions. Lower scores indicate greater difficulty. Results guide targeted intervention planning.',
    interpretation_zh: '每個結構在多個維度上進行評估。分數越低表示困難越大。結果指導有針對性的介入計劃。',
    beckman_structures: [
      {
        structure_id: 'lips',
        name_en: 'Lips',
        name_zh: '嘴唇',
        assessment_areas: [
          {
            area_id: 'lips_observation',
            name_en: 'General Observations',
            name_zh: '一般觀察',
            items: [
              { item_id: 'lips_obs1', text_en: 'Lip posture at rest (symmetry, closure, position)', text_zh: '靜態嘴唇姿勢（對稱性、閉合、位置）' },
              { item_id: 'lips_obs2', text_en: 'Lip tone (normal, hypertonic, hypotonic)', text_zh: '嘴唇肌張力（正常、過高、過低）' },
              { item_id: 'lips_obs3', text_en: 'Drooling presence and severity', text_zh: '流口水的存在及嚴重程度' },
            ],
          },
          {
            area_id: 'lips_range',
            name_en: 'Range of Movement',
            name_zh: '動作範圍',
            items: [
              { item_id: 'lips_r1', text_en: 'Upper lip - range of movement (protrusion, retraction, elevation)', text_zh: '上唇 - 動作範圍（前伸、縮回、上抬）', max_score: 3 },
              { item_id: 'lips_r2', text_en: 'Lower lip - range of movement (protrusion, retraction, depression)', text_zh: '下唇 - 動作範圍（前伸、縮回、下壓）', max_score: 4 },
              { item_id: 'lips_r3', text_en: 'Lip elongation (stretch bilaterally)', text_zh: '嘴唇伸展（雙側拉伸）', max_score: 2 },
            ],
          },
          {
            area_id: 'lips_strength',
            name_en: 'Strength',
            name_zh: '力量',
            items: [
              { item_id: 'lips_s1', text_en: 'Upper lip strength (resistance to downward pull)', text_zh: '上唇力量（抵抗向下拉力）', max_score: 6 },
              { item_id: 'lips_s2', text_en: 'Lower lip strength (resistance to upward pull)', text_zh: '下唇力量（抵抗向上拉力）', max_score: 6 },
              { item_id: 'lips_s3', text_en: 'Lip seal strength (resistance to lateral pull)', text_zh: '唇閉合力量（抵抗側向拉力）', max_score: 6 },
            ],
          },
        ],
      },
      {
        structure_id: 'cheeks',
        name_en: 'Cheeks',
        name_zh: '面頰',
        assessment_areas: [
          {
            area_id: 'cheeks_observation',
            name_en: 'General Observations',
            name_zh: '一般觀察',
            items: [
              { item_id: 'cheeks_obs1', text_en: 'Cheek tone at rest (symmetry, tone)', text_zh: '靜態面頰肌張力（對稱性、張力）' },
              { item_id: 'cheeks_obs2', text_en: 'Cheek puffing ability', text_zh: '鼓腮能力' },
            ],
          },
          {
            area_id: 'cheeks_range_strength',
            name_en: 'Range of Movement and Strength',
            name_zh: '動作範圍和力量',
            items: [
              { item_id: 'cheeks_rs1', text_en: 'Left cheek - range and strength (resistance to inward pressure)', text_zh: '左面頰 - 動作範圍和力量（抵抗向內壓力）' },
              { item_id: 'cheeks_rs2', text_en: 'Right cheek - range and strength (resistance to inward pressure)', text_zh: '右面頰 - 動作範圍和力量（抵抗向內壓力）' },
            ],
          },
        ],
      },
      {
        structure_id: 'jaw',
        name_en: 'Jaw',
        name_zh: '下巴/下顎',
        assessment_areas: [
          {
            area_id: 'jaw_observation',
            name_en: 'General Observations',
            name_zh: '一般觀察',
            items: [
              { item_id: 'jaw_obs1', text_en: 'Jaw posture at rest (open, closed, asymmetry)', text_zh: '靜態下顎姿勢（打開、閉合、不對稱）' },
              { item_id: 'jaw_obs2', text_en: 'Jaw tone (normal, hypertonic, hypotonic)', text_zh: '下顎肌張力（正常、過高、過低）' },
              { item_id: 'jaw_obs3', text_en: 'Jaw stability during function', text_zh: '功能中的下顎穩定性' },
              { item_id: 'jaw_obs4', text_en: 'Presence of tonic bite reflex', text_zh: '緊咬反射的存在' },
            ],
          },
          {
            area_id: 'jaw_range_strength',
            name_en: 'Range of Movement and Strength',
            name_zh: '動作範圍和力量',
            items: [
              { item_id: 'jaw_rs1', text_en: 'Jaw opening - range of movement', text_zh: '下顎打開 - 動作範圍', max_score: 20 },
              { item_id: 'jaw_rs2', text_en: 'Jaw closing - strength (left side)', text_zh: '下顎閉合 - 力量（左側）', max_score: 20 },
              { item_id: 'jaw_rs3', text_en: 'Jaw closing - strength (right side)', text_zh: '下顎閉合 - 力量（右側）', max_score: 20 },
              { item_id: 'jaw_rs4', text_en: 'Jaw lateralization - left', text_zh: '下顎側向運動 - 向左' },
              { item_id: 'jaw_rs5', text_en: 'Jaw lateralization - right', text_zh: '下顎側向運動 - 向右' },
            ],
          },
        ],
      },
      {
        structure_id: 'tongue',
        name_en: 'Tongue',
        name_zh: '舌頭',
        assessment_areas: [
          {
            area_id: 'tongue_observation',
            name_en: 'General Observations',
            name_zh: '一般觀察',
            items: [
              { item_id: 'tongue_obs1', text_en: 'Tongue posture at rest (position, symmetry)', text_zh: '靜態舌頭姿勢（位置、對稱性）' },
              { item_id: 'tongue_obs2', text_en: 'Tongue tone (normal, hypertonic, hypotonic)', text_zh: '舌頭肌張力（正常、過高、過低）' },
              { item_id: 'tongue_obs3', text_en: 'Presence of tongue thrust', text_zh: '舌頭前推的存在' },
              { item_id: 'tongue_obs4', text_en: 'Fasciculations or atrophy noted', text_zh: '注意到的肌束顫動或萎縮' },
            ],
          },
          {
            area_id: 'tongue_movement',
            name_en: 'Response to Pressure and Movement',
            name_zh: '對壓力和動作的反應',
            items: [
              { item_id: 'tongue_m1', text_en: 'Tongue movement toward pressure - lateral to lower gum', text_zh: '舌頭對壓力的反應 - 側向至下牙齦' },
              { item_id: 'tongue_m2', text_en: 'Tongue movement toward pressure - lateral to cheek', text_zh: '舌頭對壓力的反應 - 側向至面頰' },
              { item_id: 'tongue_m3', text_en: 'Tongue protrusion', text_zh: '舌頭伸出' },
              { item_id: 'tongue_m4', text_en: 'Tongue retraction', text_zh: '舌頭縮回' },
              { item_id: 'tongue_m5', text_en: 'Tongue lateralization - left', text_zh: '舌頭側向運動 - 向左' },
              { item_id: 'tongue_m6', text_en: 'Tongue lateralization - right', text_zh: '舌頭側向運動 - 向右' },
              { item_id: 'tongue_m7', text_en: 'Tongue elevation (tip)', text_zh: '舌頭上抬（舌尖）' },
              { item_id: 'tongue_m8', text_en: 'Tongue depression', text_zh: '舌頭下壓' },
            ],
          },
          {
            area_id: 'tongue_strength',
            name_en: 'Strength',
            name_zh: '力量',
            items: [
              { item_id: 'tongue_s1', text_en: 'Tongue protrusion strength', text_zh: '舌頭伸出力量' },
              { item_id: 'tongue_s2', text_en: 'Tongue lateralization strength - left', text_zh: '舌頭側向力量 - 向左' },
              { item_id: 'tongue_s3', text_en: 'Tongue lateralization strength - right', text_zh: '舌頭側向力量 - 向右' },
              { item_id: 'tongue_s4', text_en: 'Tongue elevation strength', text_zh: '舌頭上抬力量' },
            ],
          },
        ],
      },
    ],
    beckman_additional: {
      name_en: 'Functional Observations During Feeding',
      name_zh: '進食期間的功能觀察',
      items: [
        { item_id: 'func1', text_en: 'Sucking pattern (rhythmic, weak, absent)', text_zh: '吸吮模式（有節奏、虛弱、缺失）' },
        { item_id: 'func2', text_en: 'Chewing pattern (rotary, munching, absent)', text_zh: '咀嚼模式（旋轉、上下咀嚼、缺失）' },
        { item_id: 'func3', text_en: 'Bolus formation and transport', text_zh: '食物團形成和輸送' },
        { item_id: 'func4', text_en: 'Swallow initiation (timely, delayed)', text_zh: '吞嚥啟動（及時、延遲）' },
        { item_id: 'func5', text_en: 'Oral residue after swallow', text_zh: '吞嚥後口腔殘留物' },
        { item_id: 'func6', text_en: 'Cough/gag response during feeding', text_zh: '進食時的咳嗽/作嘔反應' },
      ],
    },
  },
};
