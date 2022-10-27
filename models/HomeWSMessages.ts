import { HomeWSSubscriptionType } from './HomeWSUpdateRequest';

export interface HomeWSSendNotificationMessage {
	subscriptionType: HomeWSSubscriptionType,
	value: any;
}

export interface HomeWSSubscribeMessage {
	subscriptionType: HomeWSSubscriptionType,
	value: 'unsubscribe' | 'subscribe'
}