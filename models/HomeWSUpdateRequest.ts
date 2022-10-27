export interface HomeWSSendNotificationRequest {
	action: HomeWSActionType,
	subscriptionType: HomeWSSubscriptionType,
	value: any;
}

export type HomeWSActionType = 'sendNotification';
export type HomeWSSubscriptionType = 'feederUpdate';