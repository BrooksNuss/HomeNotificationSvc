import { HomeWSSubscriptionType } from './HomeWSMessages';

export interface HomeWSConnection {
	connectionId: string,
	subscriptions: HomeWSSubscriptionType[]
}