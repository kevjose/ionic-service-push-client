angular.module('ionic.service.push', ['ngCordova', 'ionic.service.core'])

/**
 * The Ionic Push service client wrapper.
 *
 * Example:
 *
 * angular.controller(['$scope', '$ionicPush', function($scope, $ionicPush) {
 * }])
 *
 */
.factory('$ionicPush', [
  '$http', '$cordovaPush',
  '$ionicApp', '$ionicPushActions',
  '$ionicUser', '$timeout', '$rootScope', '$log', '$q',

function($http, $cordovaPush, $ionicApp, $ionicPushActions, $ionicUser, $timeout, $rootScope, $log, $q) {

  // Grab the current app
  var app = $ionicApp.getApp();

  //Check for required credentials
  if(!app || !app.app_id) {
    console.error('PUSH: Unable to initialize, you must call $ionicAppProvider.identify() first');
  }

  function register(options, config) {

    // If we're in development mode, generate a random token
    if(options.development) {
      var q = $q.defer();
      $timeout(function() {
        // Resolve with a guid for dev
        q.resolve(
          'DEV-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
          });
        );
      });
      return q.promise;
    } else {
      return $cordovaPush.register(config);
    }

  }

  function init(options, metadata) {
    var defer = $q.defer();

    // TODO: This should be part of a config not a direct method
    var gcmKey = $ionicApp.getGcmId();
    var api = $ionicApp.getValue('push_api_server');

    //Default configuration
    var config = {
      "senderID": gcmKey,
      "badge": true,
      "sound": true,
      "alert": true
    };

    register(options, config).then(function(token) {

      console.log('$ionicPush:REGISTERED', token);

      defer.resolve(token);

      if(token !== 'OK') {

        $rootScope.$emit('$cordovaPush:tokenReceived', {
          token: token,
          platform: 'ios'
        });

        // Push the token into the user data
        try {
          $ionicUser.push('_push.ios_tokens', token, true);
        } catch(e) {
          console.warn('Received push token before user was identified and will not be synced with ionic.io. Make sure to call $ionicUser.identify() before calling $ionicPush.register.');
        }
      }
    }, function(err) {
      console.error('$ionicPush:REGISTER_ERROR', err);
    });

    $rootScope.$on('$cordovaPush:notificationReceived', function(event, notification) {
      console.log('$ionicPush:RECEIVED', JSON.stringify(notification));

      var callbackRet = options.onNotification && options.onNotification(notification);

      // If the custom handler returns false, don't handle this at all in
      // our code
      if(callbackRet === false) {
        return;
      }

      if (ionic.Platform.isAndroid() && notification.event == "registered") {
        /**
         * Android handles push notification registration in a callback from the GCM service (whereas
         * iOS can be handled in a single call), so we need to check for a special notification type
         * here.
         */
        console.log('$ionicPush:REGISTERED', notification.regid);
        $rootScope.$emit('$cordovaPush:tokenReceived', {
          token: notification.regid,
          platform: 'android'
        });
        androidInit(notification.regid, metadata);
      }

      // If we have the notification plugin, show this
      if(options.canShowAlert && notification.alert) {
        if (navigator.notification) {
          navigator.notification.alert(notification.alert);
        } else {
          // Browser version
          alert(notification.alert);
        }
      }

      if(options.canPlaySound) {
        if (notification.sound && window.Media) {
          var snd = new Media(notification.sound);
          snd.play();
        }
      }

      if(options.canSetBadge) {
        if (notification.badge) {
          $cordovaPush.setBadgeNumber(notification.badge).then(function(result) {
            // Success!
          }, function(err) {
            console.log('Could not set badge!', err);
            // An error occurred. Show a message to the user
          });
        }
      }

      // Run any custom notification actions
      if(options.canRunActionsOnWake) {
        if(notification.foreground == "0" || notification.foreground === false) {
          $ionicPushActions.run(notification);
        }
      }
    });


    return defer.promise;
  }

  function androidInit(token, metadata) {
    // Push the token into the user data
    try {
      $ionicUser.push('_push.android_tokens', token, true);
    } catch(e) {
      console.warn('Received push token before user was identified and will not be synced with ionic.io. Make sure to call $ionicUser.identify() before calling $ionicPush.register.');
    }
  }

  return {
    /**
     * Register for push notifications.
     *
     * Configure the default notification behavior by using the options param:
     *
     * {
     *   // Whether to allow notifications to pop up an alert while in the app.
     *   // Setting this to false lets you control the push behavior more closely.
     *   allowAlert: true/false (default: true)
     *
     *   // Whether to allow notifications to update the badge
     *   allowBadge: true/false (default: true)
     *
     *   // Whether to allow notifications to play a sound
     *   allowSound: true/false (default: true)
     *
     *   // Whether to run auto actions, like navigating to a state, when a push
     *   // is opened outside of the app (foreground is false)
     *   canRunActionsOnWake: true/false (default: true)
     *
     *   // A callback to do some custom task on notification
     *   onNotification: true/false (default: true)
     * }
     */
    register: function(options, metadata){
      if(!app) { return; }

      options = angular.extend({
        development: false,
        canShowAlert: true,
        canSetBadge: true,
        canPlaySound: true,
        canRunActionsOnWake: true,
        onNotification: function() { return true; },
        onTokenRecieved: function(token) { }
      }, options);

      return init(options, metadata);
    },
    unregister: function(options) {
      return $cordovaPush.unregister(options);
    }
  }
}])

.factory('$ionicPushActions', [
    '$rootElement',
    '$injector',
function($rootElement, $injector) {
  return {
    run: function(notification) {
      if(notification.$state) {
        // Auto navigate to state

        var injector = $rootElement.injector();
        if(injector.has('$state')) {
          $state = injector.get('$state');
          var p = {};
          try {
            p = JSON.parse(notification.$stateParams);
          } catch(e) {
          }
          $state.go(notification.$state, p);
        }
      }
    }
  }
}])

