/**
 * 写真入力（Claude API）で出すエラーの型と、ユーザー向け文言への変換。
 *
 * ★ 例外のメッセージをそのまま画面に出さない。★
 *   SDK の英語メッセージや fetch の TypeError が見えても、店頭では何もできない。
 *   「次に何をすればいいか」が分かる日本語に必ず置き換える。
 *
 * 文言は減量アプリのトーンに合わせる。責める語は使わず、次の一手だけを書く。
 * 判定は SDK の型付きクラスで行い、メッセージの文字列一致では分岐しない。
 */
import { APIConnectionError, APIError, AuthenticationError, RateLimitError } from '@anthropic-ai/sdk';

export type PhotoErrorKind =
  /** navigator.onLine が false */
  | 'offline'
  /** 401。キーが違う・消された */
  | 'auth'
  /** 429 */
  | 'rate_limit'
  /** 通信そのものが届かなかった */
  | 'network'
  /** stop_reason === 'refusal'。モデルが答えを返さなかった */
  | 'refusal'
  /** 応答は返ったが JSON として読めなかった */
  | 'format'
  /** 画像の読み込み・縮小でつまずいた */
  | 'image'
  /** 上記以外の API エラー（400 / 500 / 529 など） */
  | 'api'
  | 'unknown';

export class PhotoError extends Error {
  readonly kind: PhotoErrorKind;

  constructor(kind: PhotoErrorKind, message: string) {
    super(message);
    this.name = 'PhotoError';
    this.kind = kind;
  }
}

export const OFFLINE_MESSAGE = 'オフラインでは使えません。電波の届くところでお試しください。';
export const AUTH_MESSAGE = 'APIキーを確認してください。';
export const RATE_LIMIT_MESSAGE = '短い時間に何度も呼んでいます。少し待ってからもう一度お試しください。';
export const NETWORK_MESSAGE = '通信できませんでした。電波の状態を確かめて、もう一度お試しください。';
export const REFUSAL_MESSAGE = 'この写真には答えを返せないと判断されました。手で入力してください。';
export const FORMAT_MESSAGE = '読み取った内容を解釈できませんでした。撮り直すか、手で入力してください。';
export const IMAGE_MESSAGE = '写真を読み込めませんでした。別の写真でお試しください。';

/** API エラーの status ごとの文言。表に無いものは汎用文で返す */
function apiMessage(status: number | undefined): string {
  if (status === 402) return '利用料の設定を確認してください（Anthropic のコンソール）。';
  if (status === 403) return 'このAPIキーではこの操作が許可されていません。';
  if (status === 404) return 'このAPIキーからは指定のモデルを呼べません。';
  if (status === 413) return '写真が大きすぎます。もう少し引いて撮ってみてください。';
  if (status === 529 || (status !== undefined && status >= 500)) {
    return 'Anthropic 側が混み合っています。少し待ってからもう一度お試しください。';
  }
  return `Claude API がエラーを返しました（${status ?? '不明'}）。`;
}

/** 例外を PhotoError に正規化する。具体的なクラスから順に見る */
export function toPhotoError(error: unknown): PhotoError {
  if (error instanceof PhotoError) return error;
  if (error instanceof AuthenticationError) return new PhotoError('auth', AUTH_MESSAGE);
  if (error instanceof RateLimitError) return new PhotoError('rate_limit', RATE_LIMIT_MESSAGE);
  if (error instanceof APIConnectionError) return new PhotoError('network', NETWORK_MESSAGE);
  if (error instanceof APIError) return new PhotoError('api', apiMessage(error.status));
  return new PhotoError('unknown', '読み取れませんでした。もう一度お試しください。');
}

/** 例外から画面に出す文言だけを取り出す */
export function photoErrorMessage(error: unknown): string {
  return toPhotoError(error).message;
}
