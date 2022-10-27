import { HomeWSSubscriptionType } from './HomeWSUpdateRequest';

export interface HomeWSConnection {
	connectionId: string,
	subscriptions: HomeWSSubscriptionType[]
}