import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

export interface MarketingCampaign {
  id: string;
  title_en: string;
  title_zh: string;
  is_active: boolean;
  start_date: string;
  end_date: string;
  trigger_on_app_open: boolean;
  trigger_on_exercise_count: number | null;
  trigger_on_video_submit: boolean;
  max_draws_per_day?: number | null;
}

export interface MarketingPrize {
  id: string;
  campaign_id: string;
  name_en: string;
  name_zh: string;
  voucher_image_url: string | null;
  discount_code: string | null;
  probability_weight: number;
  quantity_remaining: number;
  expiry_days: number | null;
}

export interface QueuedCampaign {
  campaign: MarketingCampaign;
  prize: MarketingPrize;
}

function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function fetchActiveCampaigns(
  triggerFilter: 'app_open' | 'exercise_count' | 'video_submit'
): Promise<MarketingCampaign[]> {
  try {
    const today = getTodayDateString();
    let query = supabase
      .from('marketing_campaigns')
      .select('*')
      .eq('is_active', true)
      .lte('start_date', today)
      .gte('end_date', today);

    if (triggerFilter === 'app_open') {
      query = query.eq('trigger_on_app_open', true);
    } else if (triggerFilter === 'video_submit') {
      query = query.eq('trigger_on_video_submit', true);
    }

    const { data, error } = await query;
    if (error) {
      log('[MarketingDraw] Error fetching campaigns:', error);
      return [];
    }

    if (triggerFilter === 'exercise_count') {
      return (data || []).filter(
        (c: MarketingCampaign) => c.trigger_on_exercise_count != null && c.trigger_on_exercise_count > 0
      );
    }

    return data || [];
  } catch (e) {
    log('[MarketingDraw] Exception fetching campaigns:', e);
    return [];
  }
}

export async function hasDrawnToday(
  patientId: string,
  campaignId: string
): Promise<boolean> {
  const count = await countDrawsToday(patientId, campaignId);
  return count > 0;
}

export async function countDrawsToday(
  patientId: string,
  campaignId: string
): Promise<number> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count, error } = await supabase
      .from('marketing_draw_log')
      .select('*', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .eq('campaign_id', campaignId)
      .gte('drawn_at', today.toISOString());

    if (error) {
      log('[MarketingDraw] Error counting draw log:', error);
      return 999;
    }
    return count || 0;
  } catch (e) {
    log('[MarketingDraw] Exception counting draw log:', e);
    return 999;
  }
}

export async function fetchAvailablePrizes(campaignId: string): Promise<MarketingPrize[]> {
  try {
    const { data, error } = await supabase
      .from('marketing_prizes')
      .select('*')
      .eq('campaign_id', campaignId)
      .gt('quantity_remaining', 0);

    if (error) {
      log('[MarketingDraw] Error fetching prizes:', error);
      return [];
    }
    return data || [];
  } catch (e) {
    log('[MarketingDraw] Exception fetching prizes:', e);
    return [];
  }
}

export function selectWeightedPrize(prizes: MarketingPrize[]): MarketingPrize | null {
  if (prizes.length === 0) return null;

  const totalWeight = prizes.reduce((sum, p) => sum + (p.probability_weight || 1), 0);
  let random = Math.random() * totalWeight;

  for (const prize of prizes) {
    random -= prize.probability_weight || 1;
    if (random <= 0) return prize;
  }
  return prizes[prizes.length - 1];
}

export async function recordDrawAndAwardPrize(
  patientId: string,
  campaignId: string,
  prize: MarketingPrize
): Promise<boolean> {
  try {
    log('[MarketingDraw] Claiming prize via RPC:', prize.id, 'campaign:', campaignId);
    const { data: success, error } = await supabase.rpc('claim_marketing_prize', {
      p_patient_id: patientId,
      p_campaign_id: campaignId,
      p_prize_id: prize.id,
    });

    if (error) {
      log('[MarketingDraw] RPC claim_marketing_prize error:', error);
      return fallbackRecordDraw(patientId, campaignId, prize);
    }

    if (!success) {
      log('[MarketingDraw] Prize claim returned false (already claimed or out of stock)');
      return false;
    }

    log('[MarketingDraw] Prize claimed successfully via RPC:', prize.name_en);
    return true;
  } catch (e) {
    log('[MarketingDraw] Exception in RPC claim, trying fallback:', e);
    return fallbackRecordDraw(patientId, campaignId, prize);
  }
}

async function fallbackRecordDraw(
  patientId: string,
  campaignId: string,
  prize: MarketingPrize
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    let expiryDate: string | null = null;
    if (prize.expiry_days) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + prize.expiry_days);
      expiryDate = expiry.toISOString();
    }

    const { error: prizeError } = await supabase
      .from('patient_prizes')
      .insert({
        patient_id: patientId,
        marketing_prize_id: prize.id,
        campaign_id: campaignId,
        won_at: now,
        expiry_date: expiryDate,
        is_viewed: false,
        is_expired: false,
      });

    if (prizeError) {
      log('[MarketingDraw] Fallback insert patient_prizes error:', prizeError);
      return false;
    }

    const { error: logError } = await supabase
      .from('marketing_draw_log')
      .insert({
        patient_id: patientId,
        campaign_id: campaignId,
        prize_id: prize.id,
        drawn_at: now,
      });

    if (logError) {
      log('[MarketingDraw] Fallback insert draw log error:', logError);
    }

    await supabase
      .from('marketing_prizes')
      .update({ quantity_remaining: Math.max(0, prize.quantity_remaining - 1) })
      .eq('id', prize.id);

    log('[MarketingDraw] Fallback prize award successful:', prize.name_en);
    return true;
  } catch (e) {
    log('[MarketingDraw] Fallback exception:', e);
    return false;
  }
}

export async function checkAndQueueCampaigns(
  patientId: string,
  triggerFilter: 'app_open' | 'exercise_count' | 'video_submit',
  todayExerciseCount?: number
): Promise<QueuedCampaign[]> {
  const queued: QueuedCampaign[] = [];

  try {
    const campaigns = await fetchActiveCampaigns(triggerFilter);
    log('[MarketingDraw] Found', campaigns.length, 'campaigns for trigger:', triggerFilter);

    for (const campaign of campaigns) {
      if (triggerFilter === 'exercise_count' && todayExerciseCount != null) {
        if (
          campaign.trigger_on_exercise_count == null ||
          todayExerciseCount < campaign.trigger_on_exercise_count
        ) {
          continue;
        }
      }

      const drawsToday = await countDrawsToday(patientId, campaign.id);
      const maxDraws = campaign.max_draws_per_day ?? 1;
      const remainingDraws = Math.max(0, maxDraws - drawsToday);

      if (remainingDraws <= 0) {
        log('[MarketingDraw] Max draws reached today for campaign:', campaign.id, 'draws:', drawsToday, '/', maxDraws);
        continue;
      }

      log('[MarketingDraw] Remaining draws for campaign:', campaign.id, '=', remainingDraws);

      const prizes = await fetchAvailablePrizes(campaign.id);
      if (prizes.length === 0) {
        log('[MarketingDraw] No prizes available for campaign:', campaign.id);
        continue;
      }

      for (let i = 0; i < remainingDraws; i++) {
        const selectedPrize = selectWeightedPrize(prizes);
        if (!selectedPrize) break;
        queued.push({ campaign, prize: selectedPrize });
      }
    }

    log('[MarketingDraw] Queued campaigns:', queued.length);
    return queued;
  } catch (e) {
    log('[MarketingDraw] Exception in checkAndQueueCampaigns:', e);
    return [];
  }
}

export async function getTodayExerciseCount(patientId: string): Promise<number> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from('exercise_logs')
      .select('id')
      .eq('patient_id', patientId)
      .gte('completed_at', today.toISOString());

    if (error) {
      log('[MarketingDraw] Error counting today exercises:', error);
      return 0;
    }
    return (data || []).length;
  } catch (e) {
    log('[MarketingDraw] Exception counting today exercises:', e);
    return 0;
  }
}
