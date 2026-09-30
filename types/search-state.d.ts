/** `YYYYMMDD` を数値化した日付キー。 */
type DateKey = number;

/** 検索や日付 UI で扱う日付キーの範囲。 */
type SearchDateRange = {
  /** 範囲に含める最小日付キー。 */
  minKey: DateKey;
  /** 範囲に含める最大日付キー。 */
  maxKey: DateKey;
};

/** 検索ロジックとUIが共有する検索条件。 */
type SearchState = {
  queryRaw: string;
  dateFromKey: DateKey | null;
  dateToKey: DateKey | null;
  hasDateFilter: boolean;
  collabHostOnly?: boolean;
  collabGuestOnly?: boolean;
  relayOnly?: boolean;
  harmonyOnly?: boolean;
};
