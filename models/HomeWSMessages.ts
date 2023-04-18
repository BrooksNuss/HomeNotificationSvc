export interface HomeWSListenerSendNotificationRequest {
	action: HomeWSListenerActionType,
	subscriptionType: HomeWSSubscriptionType,
	value: any;
}

export interface HomeWSSubscribeMessage {
	subscriptionType: HomeWSSubscriptionType,
	value: 'unsubscribe' | 'subscribe'
}

export type HomeWSListenerActionType = 'sendNotification';
export type HomeWSSubscriptionType = 'feederUpdate' | 'global';